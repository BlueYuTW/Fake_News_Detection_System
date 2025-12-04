<?php
# api
//fact check api(文字查詢)
define('GOOGLE_FACT_CHECK_API_URL', 'https://factchecktools.googleapis.com/v1alpha1/claims:search');
define('GOOGLE_FACT_CHECK_API_KEY', 'AIzaSyB1j3sVzvO7TvU9VC0ALDosjnHuXZiivqk'); //Google API 金鑰

// 金鑰與 Fact Check 相同(網站查詢)
define('GOOGLE_WEB_RISK_API_KEY', 'AIzaSyB1j3sVzvO7TvU9VC0ALDosjnHuXZiivqk');

// sightengine(影片查詢)
define('SIGHTENGINE_USER', '351635666');
define('SIGHTENGINE_SECRET', 'PyGnJLqb9ZXFyRGufKKrz6EbsuqRfbMJ'); 

// IS it AI(圖片查詢)
define('ISITAI_API_KEY','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJibHVleXV0d0BnbWFpbC5jb20iLCJleHAiOjE3NzExNzA3MTN9.nfFvMZmmy0iLuACiScrM5pfzw0cDbt1B2JBxj2BPryU');

# 資料庫(熱門議題)

define('DB_HOST', 'localhost'); // 資料庫主機
define('DB_USER', 'root'); // 資料庫使用者名稱
define('DB_PASS', 'Ab548813'); // 資料庫密碼
define('DB_NAME', 'mydb'); // 資料庫名稱

// OCR space api
define('OCR_SPACE_API_KEY', 'K88641993888957'); 
?>