document.addEventListener('DOMContentLoaded', function() {
    // --- DOM 元素宣告 ---
    const searchBtn = document.getElementById('search-btn');
    const queryInput = document.getElementById('query-text');
    const languageSelect = document.getElementById('language-select');
    const resultsContainer = document.getElementById('results');
    const urlInput = document.getElementById('url-input');
    const checkUrlBtn = document.getElementById('check-url-btn');
    const imageFileInput = document.getElementById('image-file-input');
    const detectImageBtn = document.getElementById('detect-image-btn');
    const videoFileInput = document.getElementById('video-file-input');
    const detectVideoBtn = document.getElementById('detect-video-btn');
    const videoUrlInput = document.getElementById('video-url-input');
    const detectYtVideoBtn = document.getElementById('detect-yt-video-btn');
    const hotSearchSelect = document.getElementById('hot-search-select');

    // --- 彈出式進度條元素 ---
    const progressOverlay = document.getElementById('progress-overlay');
    const progressBar = document.getElementById('progress-bar');
    const progressMessage = document.getElementById('progress-message');
    let progressInterval = null;

    // --- 進度條控制函式 ---

    function startProgressSimulation(durationInSeconds = 15, message = '處理中...') {
        if (!progressOverlay || !progressBar) return;
        
        progressMessage.textContent = message;
        progressBar.style.width = '0%';
        progressBar.textContent = '0%';
        progressOverlay.style.display = 'flex';
        
        let currentProgress = 0;
        const targetProgress = 95;
        const intervalTime = 100;
        const totalSteps = (durationInSeconds * 1000) / intervalTime;
        const increment = targetProgress / totalSteps;

        if (progressInterval) {
            clearInterval(progressInterval);
        }

        progressInterval = setInterval(() => {
            currentProgress += increment;
            if (currentProgress >= targetProgress) {
                currentProgress = targetProgress;
                clearInterval(progressInterval);
            }
            const displayProgress = Math.round(currentProgress);
            progressBar.style.width = displayProgress + '%';
            progressBar.textContent = displayProgress + '%';
        }, intervalTime);
    }

    function completeProgress() {
        if (!progressOverlay || !progressBar) return;

        if (progressInterval) {
            clearInterval(progressInterval);
        }

        progressBar.style.width = '100%';
        progressBar.textContent = '100%';

        setTimeout(() => {
            progressOverlay.style.display = 'none';
        }, 500); // 完成後延遲半秒關閉
    }

    // --- 函式定義 ---
    
    function populateHotSearchesDropdown() {
        fetch('api.php', {
            method: 'POST',
            headers: {'Content-Type': 'application/x-www-form-urlencoded'},
            body: 'action=get_hot_searches'
        })
        .then(response => response.json())
        .then(data => {
            if (hotSearchSelect && data.hot_topics && data.hot_topics.length > 0) {
                hotSearchSelect.innerHTML = '<option value="" disabled selected>--- 請選擇熱門查核議題 ---</option>';
                data.hot_topics.forEach(item => {
                    const option = document.createElement('option');
                    option.value = item.claim_text;
                    option.textContent = `[${item.rating}] ${item.claim_text.substring(0, 30)}...`;
                    hotSearchSelect.appendChild(option);
                });
            } else {
                hotSearchSelect.innerHTML = '<option value="" disabled selected>--- 目前無熱門議題 ---</option>';
            }
        })
        .catch(error => {
            console.error('無法載入熱門議題:', error);
            if (hotSearchSelect) {
                hotSearchSelect.innerHTML = '<option value="" disabled selected>--- 載入失敗 ---</option>';
            }
        });
    }

    function performSearch() {
        const query = queryInput.value.trim();
        const language = languageSelect.value;
        if (!query) {
            resultsContainer.innerHTML = '<div class="error">請輸入要查詢的內容</div>';
            return;
        }
        resultsContainer.innerHTML = '<div class="info">查詢中，請稍候...</div>';
        const formData = new FormData();
        formData.append('action', 'search');
        formData.append('query', query);
        formData.append('language', language);
        fetch('api.php', { method: 'POST', body: formData })
            .then(response => response.json())
            .then(data => {
                if (data.claims && data.claims.length > 0) {
                    showClaims(data.claims);
                } else if (data.error) {
                    resultsContainer.innerHTML = `<div class="error">查詢失敗：${data.error}</div>`;
                } else {
                    resultsContainer.innerHTML = '<div class="info">找不到相關的查核結果</div>';
                }
            })
            .catch(error => {
                resultsContainer.innerHTML = `<div class="error">查詢時發生錯誤: ${error.message}</div>`;
            });
    }

    function performUrlCheck() {
        const url = urlInput.value.trim();
        if (!url) {
            resultsContainer.innerHTML = '<div class="error">請輸入要檢查的網址</div>';
            return;
        }
        resultsContainer.innerHTML = '<div class="info">網址檢查中，請稍候...</div>';
        const formData = new FormData();
        formData.append('action', 'check_url');
        formData.append('url', url);
        fetch('api.php', { method: 'POST', body: formData })
            .then(response => response.json())
            .then(showUrlSafetyResult)
            .catch(error => {
                resultsContainer.innerHTML = `<div class="error">網址檢查時發生錯誤: ${error.message}</div>`;
            });
    }

    function performImageDetection() {
        const imageFile = imageFileInput.files[0];
        if (!imageFile) {
            resultsContainer.innerHTML = '<div class="error">請選擇要上傳的圖片</div>';
            return;
        }
        resultsContainer.innerHTML = '';
        startProgressSimulation(12, '正在上傳並進行雙重分析...');
        const formData = new FormData();
        formData.append('action', 'detect_image');
        formData.append('image_file', imageFile);
        fetch('api.php', { method: 'POST', body: formData })
            .then(response => response.json())
            .then(showImageDetectionResult)
            .catch(error => {
                resultsContainer.innerHTML = `<div class="error">圖片偵測時發生錯誤: ${error.message}</div>`;
            })
            .finally(() => {
                completeProgress();
            });
    }

    function performVideoDetection() {
        const videoFile = videoFileInput.files[0];
        if (!videoFile) {
            resultsContainer.innerHTML = '<div class="error">請選擇要上傳的影片檔案</div>';
            return;
        }
        resultsContainer.innerHTML = '';
        startProgressSimulation(30, '正在上傳並分析影片...');
        const formData = new FormData();
        formData.append('action', 'detect_video');
        formData.append('video_file', videoFile);
        fetch('api.php', { method: 'POST', body: formData })
            .then(response => response.json())
            .then(showVideoDetectionResult)
            .catch(error => {
                resultsContainer.innerHTML = `<div class="error">影片偵測時發生錯誤: ${error.message}</div>`;
            })
            .finally(() => {
                completeProgress();
            });
    }
    
    function performYtVideoDetection() {
        const ytUrl = videoUrlInput.value.trim();
        if (!ytUrl) {
            resultsContainer.innerHTML = '<div class="error">請輸入 YouTube 網址</div>';
            return;
        }
        resultsContainer.innerHTML = '';
        startProgressSimulation(45, '正在下載並分析 YouTube 影片...');
        const formData = new FormData();
        formData.append('action', 'detect_yt_video');
        formData.append('video_url', ytUrl);
        fetch('api.php', { method: 'POST', body: formData })
            .then(response => {
                if (!response.ok) {
                    return response.text().then(text => { 
                        throw new Error(`伺服器錯誤 (狀態碼: ${response.status}): ${text}`);
                    });
                }
                return response.json();
            })
            .then(showVideoDetectionResult)
            .catch(error => {
                resultsContainer.innerHTML = `<div class="error">YouTube 影片偵測時發生錯誤: ${error.message}</div>`;
            })
            .finally(() => {
                completeProgress();
            });
    }

    function showClaims(claims) {
        let html = '<h3>🔍 文字事實查核結果</h3>';
        claims.slice(0, 3).forEach(claim => {
            const review = claim.claimReview[0];
            const ratingClass = review.textualRating.includes('錯誤') || review.textualRating.includes('False') ? 'rating-false' : 'rating-true';
            html += `
                <div class="claim">
                    <p><strong>陳述：</strong> ${claim.text}</p>
                    <p><strong>查核機構：</strong> ${claim.claimant}</p>
                    <p><strong>評等：</strong> <span class="rating ${ratingClass}">${review.textualRating}</span></p>
                    <a href="${review.url}" target="_blank">查看原文</a>
                </div>
            `;
        });
        resultsContainer.innerHTML = html;
    }

    function showUrlSafetyResult(data) {
        let html = '<h3>🔗 網址安全性偵測結果</h3>';
        if (data.safe) {
            html += '<div class="result-display rating-true">✅ <strong>安全</strong><p>此網址目前未被標記為不安全。</p></div>';
        } else if (data.error) {
            html += `<div class="error">檢查失敗：${data.error}</div>`;
        } else {
            let threatType = '未知威脅';
            switch (data.threat_type) {
                case 'SOCIAL_ENGINEERING': threatType = '社交工程 (釣魚網站)'; break;
                case 'MALWARE': threatType = '惡意軟體'; break;
                case 'UNWANTED_SOFTWARE': threatType = '垃圾軟體'; break;
            }
            html += `<div class="result-display rating-false">🚨 <strong>高風險警告！</strong><p>此網址已被標記為不安全，請勿前往！</p><p>威脅類型：${threatType}</p></div>`;
        }
        resultsContainer.innerHTML = html;
    }
    
    function showImageDetectionResult(data) {
        let html = '';

        html += '<h3>🖼️ 圖片 AI 生成偵測結果</h3>';
        const aiData = data.ai_detection;
        if (aiData && aiData.error) {
            html += `<div class="error">AI 偵測失敗：${aiData.error}</div>`;
        } else if (aiData && aiData.status === 'success' && aiData.result) {
            const label = aiData.result.label;
            const confidence = (aiData.result.confidence * 100).toFixed(1);
            let finalJudgement = '';
            let judgementClass = '';
            if (label.toLowerCase() === 'ai/deepfake' || label.toLowerCase() === 'ai') {
                finalJudgement = `<strong>判斷結果：AI 生成 🤖</strong><p>此圖片有 ${confidence}% 的機率是由 AI 生成。</p>`;
                judgementClass = 'rating-false';
            } else {
                finalJudgement = `<strong>判斷結果：真人創作 ✅</strong><p>此圖片有 ${confidence}% 的機率為真人拍攝或繪畫。</p>`;
                judgementClass = 'rating-true';
            }
            html += `<div class="result-display ${judgementClass}">${finalJudgement}</div>`;
        } else {
            html += `<div class="error">AI 偵測時發生未知錯誤。 API 回應: ${JSON.stringify(aiData)}</div>`;
        }

        html += '<hr style="margin: 2em 0;"><h3>🔍 圖片內文字查核結果</h3>';
        const factData = data.fact_check;
        if (factData && factData.error) {
            html += `<div class="error">文字查核失敗：${factData.error}</div>`;
        } else if (factData && factData.extracted_text) {
            html += `<div class="info" style="margin-bottom: 1em;"><strong>辨識出的文字：</strong><p style="white-space: pre-wrap;">${factData.extracted_text}</p></div>`;
            if (factData.claims && factData.claims.length > 0) {
                factData.claims.slice(0, 2).forEach(claim => {
                    const review = claim.claimReview[0];
                    const ratingClass = review.textualRating.includes('錯誤') || review.textualRating.includes('False') ? 'rating-false' : 'rating-true';
                    html += `
                        <div class="claim">
                            <p><strong>相關陳述：</strong> ${claim.text}</p>
                            <p><strong>查核機構：</strong> ${claim.claimant}</p>
                            <p><strong>評等：</strong> <span class="rating ${ratingClass}">${review.textualRating}</span></p>
                            <a href="${review.url}" target="_blank">查看原文</a>
                        </div>
                    `;
                });
            } else {
                html += '<div class="info">找不到與圖片內文字相關的查核結果。</div>';
            }
        } else {
            html += '<div class="info">圖片中未辨識出可供查核的文字。</div>';
        }
        
        resultsContainer.innerHTML = html;
    }

    function showVideoDetectionResult(data) {
        let html = '<h3>🎬 影片 Deepfake 偵測結果</h3>';
        if (data.error) {
            html += `<div class="error">偵測失敗：${data.error}</div>`;
            if (data.debug_output) {
                html += `<h4>[詳細日誌]</h4><pre style="white-space: pre-wrap; word-wrap: break-word; background: #f4f4f4; border: 1px solid #ddd; padding: 10px; border-radius: 5px;">${data.debug_output}</pre>`;
            }
        } else if (data.status === 'success') {
            const deepfakeProb = data.deepfake?.prob || 0;
            const percentage = (deepfakeProb * 100).toFixed(1);
            
            // 將門檻調整為 0.5 (50%)
            const threshold = 0.5;
            
            let finalJudgement = '';
            let judgementClass = '';
            
            if (deepfakeProb > threshold) {
                finalJudgement = `<strong>判斷結果：疑似 Deepfake 影片 ⚠️</strong><p>偵測到 Deepfake 的可能性為 ${percentage}%。</p>`;
                judgementClass = 'rating-false'; // 紅色警戒
            } else {
                finalJudgement = `<strong>判斷結果：未檢測到明顯 Deepfake 特徵 ✅</strong><p>偵測到 Deepfake 的可能性為 ${percentage}%。</p>`;
                judgementClass = 'rating-true'; // 綠色安全
            }
            html += `<div class="result-display ${judgementClass}">${finalJudgement}</div>`;
        } else {
            html += `<div class="error">偵測時發生未知錯誤。 API 回應: ${JSON.stringify(data, null, 2)}</div>`;
        }
        resultsContainer.innerHTML = html;
    }

    // --- 事件監聽器 ---
    if(searchBtn) searchBtn.addEventListener('click', performSearch);
    if(checkUrlBtn) checkUrlBtn.addEventListener('click', performUrlCheck);
    if(detectImageBtn) detectImageBtn.addEventListener('click', performImageDetection);
    if(detectVideoBtn) detectVideoBtn.addEventListener('click', performVideoDetection);
    if(detectYtVideoBtn) detectYtVideoBtn.addEventListener('click', performYtVideoDetection);
    
    if(queryInput) queryInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            performSearch();
        }
    });

    if(hotSearchSelect) {
        hotSearchSelect.addEventListener('change', function() {
            if (this.value) {
                queryInput.value = this.value;
                performSearch();
            }
        });
    }

    // --- 初始載入 ---
    populateHotSearchesDropdown();
});