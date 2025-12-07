document.addEventListener('DOMContentLoaded', function() {
    const searchBtn = document.getElementById('search-btn');
    const queryInput = document.getElementById('query-text');
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
    const languageSelect = document.getElementById('language-select');

    const progressOverlay = document.getElementById('progress-overlay');
    function startProgressSimulation() { if(progressOverlay) progressOverlay.style.display = 'flex'; }
    function completeProgress() { if(progressOverlay) progressOverlay.style.display = 'none'; }

    fetch('api.php', { method: 'POST', body: new URLSearchParams('action=get_hot_searches') })
    .then(r => r.json())
    .then(d => {
        if(d.hot_topics && hotSearchSelect) {
            hotSearchSelect.innerHTML = '<option disabled selected>--- 選擇熱門議題 ---</option>';
            d.hot_topics.forEach(t => hotSearchSelect.innerHTML += `<option value="${t.claim_text}">[${t.rating}] ${t.claim_text.substr(0,20)}...</option>`);
        }
    })
    .catch(e => console.error(e));

    if(hotSearchSelect) hotSearchSelect.onchange = function(){ queryInput.value=this.value; performSearch(); };

    function performSearch() {
        const q = queryInput.value.trim(); if(!q) return;
        resultsContainer.innerHTML = '<div class="info">查詢中...</div>';
        const fd = new FormData(); fd.append('action','search'); fd.append('query',q); fd.append('language', languageSelect.value);
        fetch('api.php', {method:'POST', body:fd}).then(r => r.json()).then(d => {
            if (d.error) { resultsContainer.innerHTML = `<div class="error">${d.error}</div>`; return; }
            if(d.claims && d.claims.length){
                let h = '<h3>🔍 查核結果</h3>';
                d.claims.slice(0,3).forEach(c=>{
                    const rating = c.claimReview[0].textualRating;
                    const color = (rating.includes('不實') || rating.includes('錯誤')) ? 'rating-false' : 'rating-true';
                    h += `<div class="claim"><p><strong>陳述：</strong>${c.text}</p><p><strong>評等：</strong><span class="${color}">${rating}</span></p><a href="${c.claimReview[0].url}" target="_blank">詳情</a></div>`;
                });
                resultsContainer.innerHTML = h;
            } else resultsContainer.innerHTML = '<div class="info">無相關結果。</div>';
        }).catch(e => resultsContainer.innerHTML = `<div class="error">${e.message}</div>`);
    }
    if(searchBtn) searchBtn.onclick = performSearch;

    if(checkUrlBtn) checkUrlBtn.onclick = function() {
        const u = urlInput.value.trim(); if(!u) return;
        resultsContainer.innerHTML = '<div class="info">檢查中...</div>';
        const fd = new FormData(); fd.append('action','check_url'); fd.append('url',u);
        fetch('api.php', {method:'POST', body:fd}).then(r => r.json()).then(d => {
            if(d.error) resultsContainer.innerHTML = `<div class="error">${d.error}</div>`;
            else if(d.safe) resultsContainer.innerHTML = '<div class="result-display rating-true">✅ 網址安全</div>';
            else resultsContainer.innerHTML = `<div class="result-display rating-false">🚨 危險網址 (${d.threat_type})</div>`;
        }).catch(e => resultsContainer.innerHTML = `<div class="error">${e.message}</div>`);
    };

    // 統一顯示邏輯 (圖片/影片共用)
    function showResult(d, type) {
        completeProgress();
        if (d.error) {
            resultsContainer.innerHTML = `<div class="error">錯誤：${d.error}</div>`;
            return;
        }

        // 取得分數
        let deepfake = 0, general = 0;
        if (type === 'image') {
            deepfake = d.ai_detection ? d.ai_detection.deepfake_score : 0;
            general = d.ai_detection ? d.ai_detection.general_ai_score : 0;
        } else {
            deepfake = d.deepfake_score;
            general = d.general_ai_score;
        }

        const d_pct = (deepfake * 100).toFixed(1);
        const g_pct = (general * 100).toFixed(1);

        let html = `<h3>${type === 'image' ? '🖼️ 圖片' : '🎬 影片'}分析結果</h3>`;
        
        let d_class = deepfake > 0.5 ? 'rating-false' : 'rating-true';
        html += `
        <div class="result-display ${d_class}" style="margin-bottom:10px;">
            <strong>👤 Deepfake (換臉偵測)</strong>
            <div class="progress"><div style="width:${d_pct}%; background:${deepfake > 0.5 ? '#e74c3c' : '#2ecc71'}"></div></div>
            <p>可能性：${d_pct}%</p>
        </div>`;

        let g_class = general > 0.5 ? 'rating-false' : 'rating-true';
        html += `
        <div class="result-display ${g_class}">
            <strong>🤖 AI 生成 (AIGC偵測)</strong>
            <div class="progress"><div style="width:${g_pct}%; background:${general > 0.5 ? '#e74c3c' : '#2ecc71'}"></div></div>
            <p>可能性：${g_pct}%</p>
        </div>`;

        // 圖片特有的 OCR 查核
        if (type === 'image' && d.fact_check) {
            if(d.fact_check.claims && d.fact_check.claims.length) {
                html += '<hr><h4>文字查核結果：</h4>';
                d.fact_check.claims.forEach(c => {
                     html += `<div class="claim"><p><strong>評等：</strong>${c.claimReview[0].textualRating}</p><a href="${c.claimReview[0].url}" target="_blank">詳情</a></div>`;
                });
            }
        }

        resultsContainer.innerHTML = html;
    }

    if(detectImageBtn) detectImageBtn.onclick = function() {
        const f = imageFileInput.files[0]; if(!f) return;
        startProgressSimulation();
        const fd = new FormData(); fd.append('action','detect_image'); fd.append('image_file',f);
        fetch('api.php', {method:'POST', body:fd}).then(r=>r.json()).then(d=>showResult(d, 'image')).catch(e=>{
            completeProgress(); resultsContainer.innerHTML = `<div class="error">${e.message}</div>`;
        });
    };

    if(detectVideoBtn) detectVideoBtn.onclick = function() {
        const f = videoFileInput.files[0]; if(!f) return;
        startProgressSimulation();
        const fd = new FormData(); fd.append('action','detect_video'); fd.append('video_file',f);
        fetch('api.php', {method:'POST', body:fd}).then(r=>r.json()).then(d=>showResult(d, 'video')).catch(e=>{
            completeProgress(); resultsContainer.innerHTML = `<div class="error">${e.message}</div>`;
        });
    };

    if(detectYtVideoBtn) detectYtVideoBtn.onclick = function() {
        const u = videoUrlInput.value.trim(); if(!u) return;
        startProgressSimulation();
        const fd = new FormData(); fd.append('action','detect_yt_video'); fd.append('video_url',u);
        fetch('api.php', {method:'POST', body:fd}).then(r=>r.json()).then(d=>showResult(d, 'video')).catch(e=>{
            completeProgress(); resultsContainer.innerHTML = `<div class="error">${e.message}</div>`;
        });
    };
});