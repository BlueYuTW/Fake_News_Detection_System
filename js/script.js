document.addEventListener('DOMContentLoaded', function() {
    const searchBtn = document.getElementById('search-btn');
    const queryInput = document.getElementById('query-text');
    const urlInput = document.getElementById('url-input');
    const checkUrlBtn = document.getElementById('check-url-btn');
    const imageFileInput = document.getElementById('image-file-input');
    const detectImageBtn = document.getElementById('detect-image-btn');
    const videoFileInput = document.getElementById('video-file-input');
    const detectVideoBtn = document.getElementById('detect-video-btn');
    const videoUrlInput = document.getElementById('video-url-input');
    const detectYtVideoBtn = document.getElementById('detect-yt-video-btn');
    const hotSearchSelect = document.getElementById('hot-search-select');
    const languageSelect = document.getElementById('language-select');

    // 定義各區塊獨立的結果容器
    const textResults = document.getElementById('text-results');
    const urlResults = document.getElementById('url-results');
    const imageResults = document.getElementById('image-results');
    const videoResults = document.getElementById('video-results');

    // 全域清除函式：清空所有系統的回覆結果
    function clearAllContainers() {
        textResults.innerHTML = '';
        urlResults.innerHTML = '';
        imageResults.innerHTML = '';
        videoResults.innerHTML = '';
    }

    // 進度條相關元件
    const progressOverlay = document.getElementById('progress-overlay');
    const progressBar = document.getElementById('progress-bar');
    const progressMessage = document.getElementById('progress-message');
    let progressInterval;

    function startProgressSimulation(msg = "正在初始化...") {
        if(progressOverlay) {
            progressOverlay.style.display = 'flex';
            progressMessage.innerText = msg;
            progressBar.style.width = '0%';
            progressBar.innerText = '0%';
            
            let width = 0;
            clearInterval(progressInterval);
            progressInterval = setInterval(() => {
                if (width >= 90) {
                    clearInterval(progressInterval);
                } else {
                    width += (90 - width) * 0.1;
                    progressBar.style.width = Math.floor(width) + '%';
                    progressBar.innerText = Math.floor(width) + '%';
                }
            }, 500);
        }
    }

    function completeProgress() {
        clearInterval(progressInterval);
        if(progressBar) {
            progressBar.style.width = '100%';
            progressBar.innerText = '100%';
        }
        setTimeout(() => {
            if(progressOverlay) progressOverlay.style.display = 'none';
        }, 500);
    }

    // 載入熱門搜尋
    fetch('api.php', { method: 'POST', body: new URLSearchParams('action=get_hot_searches') })
    .then(r => r.json())
    .then(d => {
        if(d.hot_topics && hotSearchSelect) {
            hotSearchSelect.innerHTML = '<option disabled selected>--- 選擇熱門議題 ---</option>';
            d.hot_topics.forEach(t => {
                hotSearchSelect.innerHTML += `<option value="${t.claim_text}">[${t.rating}] ${t.claim_text.substr(0,20)}...</option>`;
            });
        }
    })
    .catch(e => console.error(e));

    if(hotSearchSelect) hotSearchSelect.onchange = function(){ queryInput.value=this.value; performSearch(); };

    // 1. 文字查核
    function performSearch() {
        const q = queryInput.value.trim();
        const lang = languageSelect.value;
        
        // 驗證輸入 (先驗證再清除，以免誤刪)
        if(!q) {
            clearAllContainers();
            textResults.innerHTML = '<div class="error">請輸入相關資料（查詢內容）</div>';
            return;
        }

        // 執行清除動作
        clearAllContainers();
        queryInput.value = ''; // 清除輸入框
        if(hotSearchSelect) hotSearchSelect.selectedIndex = 0; // 重置下拉選單

        startProgressSimulation("正在查詢文字事實查核資料庫...");
        textResults.innerHTML = '<div class="info">查詢中...</div>';
        
        const fd = new FormData();
        fd.append('action','search');
        fd.append('query',q);
        fd.append('language', lang);

        fetch('api.php', {method:'POST', body:fd}).then(r => r.json()).then(d => {
            completeProgress();
            if (d.error) { textResults.innerHTML = `<div class="error">${d.error}</div>`; return; }
            if(d.claims && d.claims.length){
                let h = '<h3>🔍 查核結果</h3>';
                d.claims.slice(0,3).forEach(c => {
                    const rating = c.claimReview[0].textualRating;
                    const url = c.claimReview[0].url;
                    const score = c.reliability_score !== undefined ? c.reliability_score : -1;
                    const label = c.risk_label || '';
                    let scoreHtml = '';
                    if (score !== -1) {
                        let barColor = score < 40 ? '#e74c3c' : (score < 80 ? '#f1c40f' : '#2ecc71');
                        scoreHtml = `<div style="margin: 8px 0;"><div style="display:flex; justify-content:space-between; font-size:0.9em; margin-bottom:2px;"><span>📊 預估可信度：<strong>${score}%</strong></span><span style="color:${barColor}">${label}</span></div><div style="background:#eee; height:8px; border-radius:4px; width: 100%;"><div style="width:${score}%; background:${barColor}; height:100%; border-radius:4px; transition: width 0.5s;"></div></div></div>`;
                    }
                    const colorClass = (rating.includes('不實') || rating.includes('錯誤')) ? 'rating-false' : 'rating-true';
                    h += `<div class="claim"><p><strong>陳述：</strong>${c.text}</p><p><strong>評等：</strong><span class="${colorClass}">${rating}</span></p>${scoreHtml}<a href="${url}" target="_blank">查看查核報告詳情</a></div>`;
                });
                textResults.innerHTML = h;
            } else { textResults.innerHTML = '<div class="info">無相關結果。</div>'; }
        }).catch(e => {
            completeProgress();
            textResults.innerHTML = `<div class="error">${e.message}</div>`;
        });
    }
    if(searchBtn) searchBtn.onclick = performSearch;

    // 2. 網址偵測
    if(checkUrlBtn) checkUrlBtn.onclick = function() {
        const u = urlInput.value.trim();
        
        if(!u) {
            clearAllContainers();
            urlResults.innerHTML = '<div class="error">請輸入相關資料（網址）</div>';
            return;
        }

        clearAllContainers();
        urlInput.value = ''; // 清除輸入框

        startProgressSimulation("正在分析網址安全性...");
        urlResults.innerHTML = '<div class="info">檢查中...</div>';
        const fd = new FormData(); fd.append('action','check_url'); fd.append('url',u);
        fetch('api.php', {method:'POST', body:fd}).then(r => r.json()).then(d => {
            completeProgress();
            if(d.error) urlResults.innerHTML = `<div class="error">${d.error}</div>`;
            else if(d.safe) urlResults.innerHTML = '<div class="result-display rating-true">✅ 網址安全</div>';
            else urlResults.innerHTML = `<div class="result-display rating-false">🚨 釣魚網址 (${d.threat_type})</div>`;
        }).catch(e => {
            completeProgress();
            urlResults.innerHTML = `<div class="error">${e.message}</div>`;
        });
    };

    // 3. 圖片偵測
    if(detectImageBtn) detectImageBtn.onclick = function() {
        const f = imageFileInput.files[0];
        
        if(!f) {
            clearAllContainers();
            imageResults.innerHTML = '<div class="error">請上傳資料（圖片檔案）</div>';
            return;
        }

        clearAllContainers();
        imageFileInput.value = ''; // 清除檔案選取

        startProgressSimulation("正在分析圖片 AI 生成特徵...");
        const fd = new FormData(); fd.append('action','detect_image'); fd.append('image_file',f);
        fetch('api.php', {method:'POST', body:fd}).then(r=>r.json()).then(d=>showResult(d, 'image', imageResults)).catch(e=>{ completeProgress(); imageResults.innerHTML = `<div class="error">${e.message}</div>`; });
    };

    // 4. 影片偵測 (檔案上傳)
    if(detectVideoBtn) detectVideoBtn.onclick = function() {
        const f = videoFileInput.files[0];
        
        if(!f) {
            clearAllContainers();
            videoResults.innerHTML = '<div class="error">請上傳資料（影片檔案）</div>';
            return;
        }

        clearAllContainers();
        videoFileInput.value = ''; // 清除檔案選取

        startProgressSimulation("正在分析影片偽造技術 (大型檔案需耗時較久)...");
        const fd = new FormData(); fd.append('action','detect_video'); fd.append('video_file',f);
        fetch('api.php', {method:'POST', body:fd}).then(r=>r.json()).then(d=>showResult(d, 'video', videoResults)).catch(e=>{ completeProgress(); videoResults.innerHTML = `<div class="error">${e.message}</div>`; });
    };

    // 5. 影片偵測 (YouTube)
    if(detectYtVideoBtn) detectYtVideoBtn.onclick = function() {
        const u = videoUrlInput.value.trim();
        
        if(!u) {
            clearAllContainers();
            videoResults.innerHTML = '<div class="error">請輸入相關資料（YouTube 網址）</div>';
            return;
        }

        const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+$/;
        if (!youtubeRegex.test(u)) {
            clearAllContainers();
            videoResults.innerHTML = '<div class="error">⚠️ 請輸入有效的 YouTube 影片網址！</div>';
            return;
        }

        clearAllContainers();
        videoUrlInput.value = ''; // 清除輸入框

        startProgressSimulation("正在從 YouTube 擷取內容並進行 AI 偵測...");
        const fd = new FormData(); fd.append('action','detect_yt_video'); fd.append('video_url',u);
        fetch('api.php', {method:'POST', body:fd}).then(r=>r.json()).then(d=>showResult(d, 'video', videoResults)).catch(e=>{ completeProgress(); videoResults.innerHTML = `<div class="error">${e.message}</div>`; });
    };

    function showResult(d, type, targetElement) {
        completeProgress();
        if (d.error) { targetElement.innerHTML = `<div class="error">錯誤：${d.error}</div>`; return; }
        let general = d.general_ai_score || 0;
        if (type === 'image' && d.ai_detection) general = d.ai_detection.general_ai_score;
        const g_pct = (general * 100).toFixed(1);
        let g_class = general > 0.5 ? 'rating-false' : 'rating-true';
        let html = `<h3>${type === 'image' ? '🖼️ 圖片' : '🎬 影片'}分析結果</h3><div class="result-display ${g_class}"><strong>🤖 AI 生成偵測 (AIGC)</strong><div class="progress"><div style="width:${g_pct}%; background:${general > 0.5 ? '#e74c3c' : '#2ecc71'}"></div></div><p>AI 生成可能性：${g_pct}%</p></div>`;
        if (type === 'video') {
            let deepfake = d.deepfake_score;
            if (deepfake === -1.0) html += `<div class="result-display rating-unknown" style="margin-top: 10px; background-color: #f8f9fa; border-left: 5px solid #95a5a6;"><strong>👤 Deepfake 換臉偵測</strong><p style="color: #7f8c8d; font-weight: bold;">⚠️ 未偵測到清晰人臉 (可能因遮擋/墨鏡/側臉)</p></div>`;
            else {
                const d_pct = (deepfake * 100).toFixed(1);
                let d_class = deepfake > 0.5 ? 'rating-false' : 'rating-true';
                html += `<div class="result-display ${d_class}" style="margin-top: 10px;"><strong>👤 Deepfake 換臉偵測</strong><div class="progress"><div style="width:${d_pct}%; background:${deepfake > 0.5 ? '#e74c3c' : '#2ecc71'}"></div></div><p>換臉可能性：${d_pct}%</p></div>`;
            }
        }
        html += `<p style="font-size: 0.9em; color: #666; margin-top: 5px;">(數值越低代表越像真實拍攝；數值越高代表越像 AI/合成)</p>`;
        if (type === 'image' && d.fact_check && d.fact_check.claims && d.fact_check.claims.length) {
            html += '<hr><h4>🔍 圖片文字查核結果：</h4>';
            d.fact_check.claims.forEach(c => {
                const score = c.reliability_score !== undefined ? c.reliability_score : -1;
                const label = c.risk_label || '';
                let scoreText = (score !== -1) ? `<br>📊 可信度：${score}% (${label})` : '';
                html += `<div class="claim"><p><strong>評等：</strong>${c.claimReview[0].textualRating}${scoreText}</p><a href="${c.claimReview[0].url}" target="_blank">詳情</a></div>`;
            });
        }
        targetElement.innerHTML = html;
    }
});