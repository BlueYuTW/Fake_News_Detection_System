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

    // 進度條相關函式 (省略，保持原樣即可，或複製之前的)
    function startProgressSimulation() { document.getElementById('progress-overlay').style.display = 'flex'; }
    function completeProgress() { document.getElementById('progress-overlay').style.display = 'none'; }

    // 熱門搜尋
    fetch('api.php', { method: 'POST', body: new URLSearchParams('action=get_hot_searches') })
    .then(r=>r.json()).then(d=>{
        if(d.hot_topics) {
            hotSearchSelect.innerHTML = '<option disabled selected>--- 選擇熱門議題 ---</option>';
            d.hot_topics.forEach(t => hotSearchSelect.innerHTML += `<option value="${t.claim_text}">[${t.rating}] ${t.claim_text.substr(0,20)}...</option>`);
        }
    });

    if(hotSearchSelect) hotSearchSelect.onchange = function(){ queryInput.value=this.value; performSearch(); };

    // 搜尋
    function performSearch() {
        const q = queryInput.value.trim(); if(!q) return;
        resultsContainer.innerHTML = '查詢中...';
        const fd = new FormData(); fd.append('action','search'); fd.append('query',q); fd.append('language', languageSelect.value);
        fetch('api.php', {method:'POST', body:fd}).then(r=>r.json()).then(d=>{
            if(d.claims && d.claims.length){
                let h = '<h3>🔍 查核結果</h3>';
                d.claims.slice(0,3).forEach(c=>{
                    h += `<div class="claim"><p>陳述：${c.text}</p><p>評等：${c.claimReview[0].textualRating}</p><a href="${c.claimReview[0].url}" target="_blank">詳情</a></div>`;
                });
                resultsContainer.innerHTML = h;
            } else resultsContainer.innerHTML = '無相關查核報告。';
        });
    }
    if(searchBtn) searchBtn.onclick = performSearch;

    // 網址檢查
    if(checkUrlBtn) checkUrlBtn.onclick = function() {
        const u = urlInput.value.trim(); if(!u) return;
        resultsContainer.innerHTML = '檢查中...';
        const fd = new FormData(); fd.append('action','check_url'); fd.append('url',u);
        fetch('api.php', {method:'POST', body:fd}).then(r=>r.json()).then(d=>{
            if(d.safe) resultsContainer.innerHTML = '<div class="rating-true">✅ 安全網址</div>';
            else resultsContainer.innerHTML = `<div class="rating-false">🚨 危險！(${d.threat_type})</div>`;
        });
    };

    // 圖片偵測 (修正 0% 問題)
    if(detectImageBtn) detectImageBtn.onclick = function() {
        const f = imageFileInput.files[0]; if(!f) return;
        startProgressSimulation();
        const fd = new FormData(); fd.append('action','detect_image'); fd.append('image_file',f);
        fetch('api.php', {method:'POST', body:fd}).then(r=>r.json()).then(d=>{
            completeProgress();
            let h = '<h3>🖼️ 分析結果</h3>';
            
            // AI 偵測顯示
            if(d.ai_detection && d.ai_detection.fake_probability !== undefined) {
                const prob = d.ai_detection.fake_probability;
                const pct = (prob * 100).toFixed(1);
                if(prob > 0.5) h += `<div class="rating-false">⚠️ 疑似 AI/Deepfake (${pct}%)</div>`;
                else h += `<div class="rating-true">✅ 判定為真實影像 (合成機率 ${pct}%)</div>`;
            } else {
                h += '<div>AI 偵測失敗</div>';
            }

            // OCR & 查核顯示
            if(d.fact_check && d.fact_check.claims && d.fact_check.claims.length) {
                h += '<hr><h4>文字查核結果：</h4>';
                d.fact_check.claims.forEach(c => {
                    h += `<div class="claim"><p>評等：${c.claimReview[0].textualRating}</p><a href="${c.claimReview[0].url}" target="_blank">詳情</a></div>`;
                });
            } else if (d.fact_check && d.fact_check.extracted_text) {
                h += '<hr><p>已讀取圖片文字，但未找到相關謠言查核報告。</p>';
            }
            resultsContainer.innerHTML = h;
        }).catch(e=>{ completeProgress(); resultsContainer.innerHTML = '發生錯誤'; });
    };

    // 影片偵測 (共用邏輯)
    function handleVideo(fd) {
        startProgressSimulation();
        fetch('api.php', {method:'POST', body:fd}).then(r=>r.json()).then(d=>{
            completeProgress();
            let h = '<h3>🎬 影片分析結果</h3>';
            if(d.status === 'success') {
                const prob = d.deepfake.prob;
                const pct = (prob * 100).toFixed(1);
                if(prob > 0.5) h += `<div class="rating-false">⚠️ 疑似 Deepfake (${pct}%)</div>`;
                else h += `<div class="rating-true">✅ 未檢測到明顯特徵 (合成機率 ${pct}%)</div>`;
            } else {
                h += `<div class="error">錯誤：${d.message || d.error}</div>`;
            }
            resultsContainer.innerHTML = h;
        }).catch(e=>{ completeProgress(); resultsContainer.innerHTML = '伺服器錯誤'; });
    }

    if(detectVideoBtn) detectVideoBtn.onclick = function() {
        const f = videoFileInput.files[0]; if(f) { const fd=new FormData(); fd.append('action','detect_video'); fd.append('video_file',f); handleVideo(fd); }
    };
    if(detectYtVideoBtn) detectYtVideoBtn.onclick = function() {
        const u = videoUrlInput.value.trim(); if(u) { const fd=new FormData(); fd.append('action','detect_yt_video'); fd.append('video_url',u); handleVideo(fd); }
    };
});