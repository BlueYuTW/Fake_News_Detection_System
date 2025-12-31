import uvicorn
from fastapi import FastAPI, File, UploadFile, Form
from transformers import pipeline
from PIL import Image
import io
import cv2
import numpy as np
import os
import re

app = FastAPI()

# --- 1. 載入模型與工具 ---
print("正在初始化 AI 偵測系統...")

face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')

try:
    print("載入模型 A (Organika/sdxl-detector)...")
    model_a = pipeline("image-classification", model="Organika/sdxl-detector")
    print("載入模型 B (dima806/deepfake_vs_real_image_detection)...")
    model_b = pipeline("image-classification", model="dima806/deepfake_vs_real_image_detection")
    print("雙模型載入完成！")
except Exception as e:
    print(f"模型載入發生錯誤: {e}")

# --- 輔助函式 ---
def get_single_model_score(pipe, image):
    try:
        results = pipe(image)
        score = 0.0
        for res in results:
            label = res['label'].lower()
            val = res['score']
            if 'fake' in label or 'ai' in label or 'artificial' in label:
                score = val
                break
            if 'real' in label or 'human' in label:
                score = 1.0 - val
                break
        return score
    except:
        return 0.0

# --- AIGC 核心分析邏輯 ---
def analyze_aigc_score(image: Image.Image):
    score_a = get_single_model_score(model_a, image)
    score_b = get_single_model_score(model_b, image)
    
    try:
        img_np = np.array(image)
        if len(img_np.shape) == 3: gray = cv2.cvtColor(img_np, cv2.COLOR_RGB2GRAY)
        else: gray = img_np
        sharpness = cv2.Laplacian(gray, cv2.CV_64F).var()
        (mean, std_dev) = cv2.meanStdDev(img_np)
        complexity = np.mean(std_dev)
    except:
        sharpness = 100.0; complexity = 50.0

    # 1. 【卡通/梗圖保護網】
    if score_b < 0.3 and sharpness < 300 and score_a < 0.99:
        return score_b

    # 2. 【高分爭議區】
    elif score_a > 0.9:
        if score_b < 0.02:
            if complexity < 45: return score_b # PPT
            elif sharpness < 400: return score_b # 模糊截圖
            else: return score_a # Sora
        else:
            return (score_a * 0.1) + (score_b * 0.9) # 手機 HDR

    # 3. 【絕對真實區】
    elif score_b < 0.05:
         return score_b

    # 4. 【一般區】
    else:
        final_score = (score_a * 0.6) + (score_b * 0.4)
        if 0.4 < final_score < 0.65:
            final_score *= 0.8
        return final_score

# --- Deepfake 核心分析邏輯 ---
def analyze_deepfake_score(image_pil: Image.Image, current_aigc_score):
    img_np = np.array(image_pil)
    if len(img_np.shape) == 2: img_np = cv2.cvtColor(img_np, cv2.COLOR_GRAY2RGB)
    open_cv_image = img_np[:, :, ::-1].copy()
    gray = cv2.cvtColor(open_cv_image, cv2.COLOR_BGR2GRAY)
    
    faces = face_cascade.detectMultiScale(gray, 1.1, 4, minSize=(30, 30))
    max_face_score = 0.0
    
    if len(faces) > 0:
        for (x, y, w, h) in faces:
            margin = int(w * 0.2)
            x_start = max(0, x - margin)
            y_start = max(0, y - margin)
            x_end = min(image_pil.width, x + w + margin)
            y_end = min(image_pil.height, y + h + margin)
            face_crop = image_pil.crop((x_start, y_start, x_end, y_end))
            
            try:
                face_np = np.array(face_crop)
                if len(face_np.shape) == 3: f_gray = cv2.cvtColor(face_np, cv2.COLOR_RGB2GRAY)
                else: f_gray = face_np
                face_sharp = cv2.Laplacian(f_gray, cv2.CV_64F).var()
            except: face_sharp = 100.0

            s = get_single_model_score(model_b, face_crop)
            
            # 情境門檻
            if current_aigc_score > 0.05:
                sharp_limit = 10.0; score_limit = 0.65 
            else:
                sharp_limit = 50.0; score_limit = 0.95

            if face_sharp < sharp_limit or s < score_limit: 
                s *= 0.1 
            
            if s > max_face_score: max_face_score = s
    
    return max_face_score

# --- API: 圖片偵測 ---
@app.post("/detect/image")
async def detect_image_endpoint(file: UploadFile = File(...)):
    try:
        image_data = await file.read()
        image = Image.open(io.BytesIO(image_data)).convert("RGB")
        aigc_score = analyze_aigc_score(image)
        return {"status": "success", "deepfake_score": 0.0, "general_ai_score": aigc_score}
    except Exception as e:
        return {"status": "error", "message": str(e)}

# --- API: 影片偵測 ---
@app.post("/detect/video")
async def detect_video_endpoint(file: UploadFile = File(...), video_title: str = Form(None)):
    safe_filename = os.path.basename(file.filename)
    temp_filename = f"temp_{safe_filename}"
    try:
        with open(temp_filename, "wb") as buffer: buffer.write(await file.read())
        cap = cv2.VideoCapture(temp_filename)
        if not cap.isOpened(): raise Exception("無法開啟影片")
        fps = cap.get(cv2.CAP_PROP_FPS)
        if fps == 0: fps = 24
        frame_interval = int(fps) # 每秒取一幀
        
        total_frames_checked = 0
        sum_aigc = 0.0; max_aigc = 0.0
        sum_deepfake = 0.0; max_deepfake = 0.0
        total_faces_detected_count = 0

        while True:
            ret, frame = cap.read()
            if not ret: break
            if total_frames_checked >= 40: break # 最多檢查 40 幀

            if total_frames_checked % frame_interval == 0:
                rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                pil_image = Image.fromarray(rgb_frame)
                
                # 1. AIGC
                a_score = analyze_aigc_score(pil_image)
                sum_aigc += a_score
                if a_score > max_aigc: max_aigc = a_score
                
                # 2. Deepfake
                d_score = analyze_deepfake_score(pil_image, a_score)
                if d_score > 0 or analyze_deepfake_score(pil_image, a_score) > -1:
                    img_np = np.array(pil_image)
                    gray = cv2.cvtColor(img_np, cv2.COLOR_RGB2GRAY)
                    faces = face_cascade.detectMultiScale(gray, 1.1, 4, minSize=(30, 30))
                    if len(faces) > 0: total_faces_detected_count += 1 

                sum_deepfake += d_score
                if d_score > max_deepfake: max_deepfake = d_score
                
            total_frames_checked += 1

        cap.release()
        
        checked_count = (total_frames_checked // frame_interval) + 1
        final_aigc = 0.0; final_deepfake = 0.0
        
        if checked_count > 0:
            avg_aigc = sum_aigc / checked_count
            final_aigc = (avg_aigc * 0.6) + (max_aigc * 0.4)
            
            if total_faces_detected_count == 0:
                final_deepfake = -1.0
            else:
                if max_deepfake > 0.8: final_deepfake = max_deepfake
                else: final_deepfake = (sum_deepfake / checked_count * 0.3) + (max_deepfake * 0.7)

        # --- 最終邏輯覆蓋 ---

        # 1. 標題關鍵字強制覆蓋 (優先權最高)
        # 只要標題自首是 AI，我們就相信它，不用管像素分析結果
        if video_title:
            title_lower = video_title.lower()
            print(f"Checking Title: {title_lower}") 
            
            ai_keywords = [
                "sora", "openai", "midjourney", "runway", "pika", 
                "ai video", "ai generated", "generated with ai", "generated by ai",
                "asked ai", "using ai", "made by ai", "with ai",
                "#ai", "#aivideo", "#sora", 
                "ai生成", "ai合成", "人工智能", "人工智慧"
            ]
            
            is_ai_title = False
            
            # 使用正則表達式檢查單獨的 "ai" 單字 (避免抓到 mail, pain 等)
            if re.search(r'\bai\b', title_lower):
                print(f"Title Override: Found standalone 'ai' in title.")
                is_ai_title = True
            
            if not is_ai_title:
                for keyword in ai_keywords:
                    if keyword in title_lower:
                        print(f"Title Override: Found keyword '{keyword}' in title.")
                        is_ai_title = True
                        break
            
            if is_ai_title:
                # 強制拉高 AIGC 分數
                final_aigc = 0.99
                # 純 AI 生成影片 (如 Sora/Runway) 通常不是 Deepfake (換臉)，所以 Deepfake 歸零
                final_deepfake = 0.0

        # 2. 絕對真人保護 (AIGC 極低)
        elif final_aigc < 0.01 and final_deepfake < 0.85 and final_deepfake != -1.0:
            final_deepfake *= 0.1

        # 3. AI 合成獸過濾 (AIGC 高 + Deepfake 低)
        elif final_aigc > 0.15 and final_deepfake < 0.6 and final_deepfake != -1.0:
            final_deepfake = 0.0
        
        # 4. 純 AI 覆蓋 (Sora)
        elif final_aigc > 0.7:
            final_deepfake = 0.0
            
        return {
            "status": "success",
            "deepfake_score": final_deepfake,
            "general_ai_score": final_aigc,
            "frames_checked": total_frames_checked,
            "faces_detected": total_faces_detected_count,
            "video_title": video_title
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}
    finally:
        if os.path.exists(temp_filename):
            try:
                os.remove(temp_filename)
            except:
                pass

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)