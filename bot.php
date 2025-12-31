<?php
require 'vendor/autoload.php';
require_once 'config.php';

use LINE\LINEBot;
use LINE\LINEBot\HTTPClient\CurlHTTPClient;
use LINE\LINEBot\MessageBuilder\TextMessageBuilder;
use LINE\LINEBot\Response;

$channel_access_token = '58QwghlGu6I3kyXksd3+E2ewf71ug3hmDzhOtMVEr/mVo19FsmOP9PiNsijP85SQsRa7C61dHAJJ+8ssCxGPs8XjPM+sdK++0OM+S3JWKWB+wlGecp0ZL72eZY3ljFSlJsc81S5EEJxuO2d+w7XqwwdB04t89/1O/w1cDnyilFU=';
$channel_secret = 'd120efb76cb1e2f5465e68b97e96f5af';

const GOOGLE_WEB_RISK_API_KEY_CONST = GOOGLE_WEB_RISK_API_KEY;
const USER_STATE_FILE = 'user_states.json';

$httpClient = new CurlHTTPClient($channel_access_token);
$bot = new LINEBot($httpClient, ['channelSecret' => $channel_secret]);
$dataBot = new LINEBot($httpClient, ['channelSecret' => $channel_secret, 'endpointBase' => 'https://api-data.line.me']);

function getContentWithRetry(LINEBot $dataBot, string $messageId): Response {
    $response = $dataBot->getMessageContent($messageId);
    if ($response->getHTTPStatus() === 202) {
        sleep(2);
        $response = $dataBot->getMessageContent($messageId);
    }
    return $response;
}

function make_curl_request_with_files(string $url, array $postData = []): string|false {
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 600);
    $headers = ['ngrok-skip-browser-warning: true'];
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
    if (!empty($postData)) {
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $postData);
    }
    $response = curl_exec($ch);
    $http_status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    ($ch);
    return ($http_status === 200) ? $response : false;
}

function make_curl_request(string $url, array $postData = []): string|false {
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 600); 
    $headers = ['ngrok-skip-browser-warning: true'];
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
    if (!empty($postData)) {
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($postData));
    }
    $response = curl_exec($ch);
    $http_status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    ($ch);
    return ($http_status === 200) ? $response : false;
}

function has_image_trigger(string $message): bool {
    $normalizedMessage = mb_strtolower(str_replace(['？', '?'], '', $message));
    if (mb_strlen($normalizedMessage) > 20) return false;
    $commandVerbs = ['分析', '偵測', '查', '幫我分析', '幫我偵測', '幫我查'];
    $isCommand = false;
    foreach ($commandVerbs as $verb) { if (mb_strpos($normalizedMessage, $verb) === 0) { $isCommand = true; break; } }
    if (mb_strpos($normalizedMessage, '是不是ai合成') !== false && mb_strpos($normalizedMessage, '影片') === false) $isCommand = true;
    if (!$isCommand) return false;
    $subjectKeywords = ['圖片', '照片', '圖'];
    foreach ($subjectKeywords as $keyword) { if (mb_strpos($normalizedMessage, $keyword) !== false) return true; }
    return false;
}

function has_video_trigger(string $message): bool {
    $normalizedMessage = mb_strtolower(str_replace(['？', '?'], '', $message));
    if (mb_strlen($normalizedMessage) > 20) return false;
    $commandVerbs = ['分析', '偵測', '查', '幫我分析', '幫我偵測', '幫我查'];
    $isCommand = false;
    foreach ($commandVerbs as $verb) { if (mb_strpos($normalizedMessage, $verb) === 0) { $isCommand = true; break; } }
    if (!$isCommand) return false;
    $subjectKeywords = ['影片', 'yt', 'youtube'];
    foreach ($subjectKeywords as $keyword) { if (mb_strpos($normalizedMessage, $keyword) !== false) return true; }
    return false;
}

function should_process_fact_check(string $message): bool {
    $triggers = ['查一下', '查一下，', '查一下,'];
    foreach ($triggers as $trigger) if (mb_strpos($message, $trigger) === 0) return true;
    return false;
}

function cleanup_message_for_query(string $message): string {
    $triggers = ['查一下，', '查一下,', '查一下'];
    foreach ($triggers as $trigger) if (mb_strpos($message, $trigger) === 0) return trim(mb_substr($message, mb_strlen($trigger)));
    return $message;
}

function is_youtube_url(string $text): ?string { $pattern = '/(https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\/[^\s]+)/'; if (preg_match($pattern, $text, $matches)) return $matches[0]; return null; }
function setUserState(string $userId, string $state): void { $states = file_exists(USER_STATE_FILE) ? json_decode(file_get_contents(USER_STATE_FILE), true) : []; $states[$userId] = $state; file_put_contents(USER_STATE_FILE, json_encode($states, JSON_PRETTY_PRINT)); }
function getUserState(string $userId): ?string { if (!file_exists(USER_STATE_FILE)) return null; $states = json_decode(file_get_contents(USER_STATE_FILE), true); return $states[$userId] ?? null; }
function clearUserState(string $userId): void { $states = file_exists(USER_STATE_FILE) ? json_decode(file_get_contents(USER_STATE_FILE), true) : []; if (isset($states[$userId])) { unset($states[$userId]); file_put_contents(USER_STATE_FILE, json_encode($states, JSON_PRETTY_PRINT)); } }

// --- 機器人網址檢查函式修正 (增加 FB 相容性) ---
function check_url_existence_bot(string $url): bool {
    // 第一階段：HEAD
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_NOBODY, true);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 8);
    curl_setopt($ch, CURLOPT_TIMEOUT, 12);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    curl_exec($ch);
    $curl_err = curl_errno($ch);
    $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    ($ch);
    
    if ($curl_err === 0 && $http_code >= 200 && $http_code < 400) return true;

    // 第二階段：GET (針對會擋 HEAD 的網站如 Facebook)
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    curl_setopt($ch, CURLOPT_RANGE, '0-512');
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 8);
    curl_setopt($ch, CURLOPT_TIMEOUT, 12);
    curl_exec($ch);
    $curl_err_get = curl_errno($ch);
    $http_code_get = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    ($ch);

    if ($curl_err_get === 0 && $http_code_get > 0 && $http_code_get !== 404) return true;
    
    return false; 
}

function check_url_safety(string $url, string $apiKey): array { $queryParams = http_build_query(['key' => $apiKey, 'uri' => $url]); $threatTypes = ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE']; foreach ($threatTypes as $type) $queryParams .= '&threatTypes=' . urlencode($type); $apiUrl = 'https://webrisk.googleapis.com/v1/uris:search?' . $queryParams; $response = make_curl_request($apiUrl); if ($response === false) return ['error' => '無法連接至 Google Web Risk API。']; $data = json_decode($response, true); if (isset($data['error'])) return ['error' => $data['error']['message']]; if (isset($data['threat'])) return ['safe' => false, 'threat_type' => $data['threat']['threatTypes'][0] ?? 'UNKNOWN']; return ['safe' => true]; }

function handle_hot_topics_response(string|false $apiResponse, string $targetId, LINEBot $bot): void {
    if ($apiResponse === false) { $bot->pushMessage($targetId, new TextMessageBuilder("無法連接至資料庫。")); return; }
    $data = json_decode($apiResponse, true);
    if (!isset($data['hot_topics']) || empty($data['hot_topics'])) { $bot->pushMessage($targetId, new TextMessageBuilder("目前沒有熱門查核資料。")); return; }
    $msg = "🔥 最近熱門議題：\n";
    foreach ($data['hot_topics'] as $topic) $msg .= "\n• [{$topic['rating']}] " . mb_substr($topic['claim_text'], 0, 30) . '...';
    $bot->pushMessage($targetId, new TextMessageBuilder($msg));
}

function handle_image_analysis_response(string|false $apiResponse, string $targetId, LINEBot $bot): void {
    if ($apiResponse === false) { $bot->pushMessage($targetId, new TextMessageBuilder("分析服務連線失敗。")); return; }
    $data = json_decode($apiResponse, true);
    $ai = $data['ai_detection'] ?? []; $g_pct = round(($ai['general_ai_score'] ?? 0) * 100, 1);
    $msg = "🖼️ 圖片分析：\n🤖 AI 生成：{$g_pct}%\n" . ($g_pct > 50 ? "⚠️ 極高機率為 AI 生成！" : "✅ 真實影像。");
    $factData = $data['fact_check'] ?? null;
    if ($factData && !empty($factData['claims'])) {
        $claim = $factData['claims'][0];
        $msg .= "\n\n🔍 文字查核：\n評等：「{$claim['claimReview'][0]['textualRating']}」\n詳情：{$claim['claimReview'][0]['url']}";
    }
    $bot->pushMessage($targetId, new TextMessageBuilder($msg));
}

function handle_video_analysis_response(string|false $apiResponse, string $targetId, LINEBot $bot): void {
    if ($apiResponse === false) { $bot->pushMessage($targetId, new TextMessageBuilder("分析服務連線失敗。")); return; }
    $data = json_decode($apiResponse, true);
    $g_pct = round(($data['general_ai_score'] ?? 0) * 100, 1);
    $d_score = $data['deepfake_score'] ?? 0;
    $d_text = ($d_score == -1.0) ? "⚠️ 未偵測到人臉" : round($d_score * 100, 1) . "%";
    $msg = "🎬 影片分析：\n🤖 AI 指數: {$g_pct}%\n👤 Deepfake: {$d_text}\n" . ($d_score > 0.5 ? "⚠️ 偵測到換臉痕跡！" : "✅ 未偵測到換臉痕跡！");
    $bot->pushMessage($targetId, new TextMessageBuilder($msg));
}

$input = file_get_contents('php://input'); $events = json_decode($input, true);
if (is_array($events) && !empty($events['events'])) {
    foreach ($events['events'] as $event) {
        if ($event['type'] == 'message') {
            $replyToken = $event['replyToken']; $source = $event['source']; $userId = $source['userId']; $userState = getUserState($userId);
            $targetId = $source['groupId'] ?? $userId;
            $apiUrl = 'https://91ebb7617b74.ngrok-free.app/api.php';

            if ($event['message']['type'] === 'image' && $userState === 'awaiting_image') {
                $bot->replyText($replyToken, '收到圖片，分析中...'); clearUserState($userId);
                $response = getContentWithRetry($dataBot, $event['message']['id']);
                if ($response->isSucceeded()) {
                    $tempPath = 'uploads/' . uniqid('line_img_', true) . '.jpg'; file_put_contents($tempPath, $response->getRawBody());
                    $apiRes = make_curl_request_with_files($apiUrl, ['action' => 'detect_image', 'image_file' => new CURLFile($tempPath)]);
                    if (file_exists($tempPath)) unlink($tempPath); handle_image_analysis_response($apiRes, $targetId, $bot);
                }
                continue;
            }
            if ($event['message']['type'] === 'video' && $userState === 'awaiting_video') {
                $bot->replyText($replyToken, '收到影片，分析中...'); clearUserState($userId);
                $response = getContentWithRetry($dataBot, $event['message']['id']);
                if ($response->isSucceeded()) {
                    $tempPath = 'uploads/' . uniqid('line_vid_', true) . '.mp4'; file_put_contents($tempPath, $response->getRawBody());
                    $apiRes = make_curl_request_with_files($apiUrl, ['action' => 'detect_video', 'video_file' => new CURLFile($tempPath)]);
                    if (file_exists($tempPath)) unlink($tempPath); handle_video_analysis_response($apiRes, $targetId, $bot);
                }
                continue;
            }
            if ($event['message']['type'] === 'text') {
                $userMsg = trim($event['message']['text']);
                if ($userMsg === '取消') { clearUserState($userId); $bot->replyText($replyToken, '已取消。'); continue; }
                if ($userMsg === '網站') { $bot->replyText($replyToken, 'https://91ebb7617b74.ngrok-free.app/'); continue; }
                if (has_image_trigger($userMsg)) { setUserState($userId, 'awaiting_image'); $bot->replyText($replyToken, '請傳送圖片。'); continue; }
                if (has_video_trigger($userMsg)) { setUserState($userId, 'awaiting_video'); $bot->replyText($replyToken, '請傳送影片或 YouTube 連結。'); continue; }
                if ($userState === 'awaiting_video' && ($ytUrl = is_youtube_url($userMsg))) {
                    clearUserState($userId); $bot->replyText($replyToken, '分析 YouTube影片中...');
                    handle_video_analysis_response(make_curl_request($apiUrl, ['action' => 'detect_yt_video', 'video_url' => $ytUrl]), $targetId, $bot);
                    continue;
                }
                if ($userMsg === '熱門議題') { handle_hot_topics_response(make_curl_request($apiUrl, ['action' => 'get_hot_searches']), $targetId, $bot); continue; }
                if (should_process_fact_check($userMsg)) {
                    $query = cleanup_message_for_query($userMsg); if (empty($query)) { handle_hot_topics_response(make_curl_request($apiUrl, ['action' => 'get_hot_searches']), $targetId, $bot); continue; }
                    $data = json_decode(make_curl_request($apiUrl, ['action' => 'search', 'query' => $query]), true);
                    if (isset($data['claims']) && !empty($data['claims'])) {
                        $reply = "🔍 「{$query}」查核結果如下：\n";
                        foreach (array_slice($data['claims'], 0, 3) as $c) $reply .= "\n⚖️ [{$c['claimReview'][0]['textualRating']}] {$c['text']}\n🔗 {$c['claimReview'][0]['url']}\n";
                        $bot->replyText($replyToken, $reply);
                    } else $bot->replyText($replyToken, '查無結果。');
                    continue;
                }
                
                preg_match('/(https?:\/\/[^\s]+)/', $userMsg, $matches);
                if (isset($matches[0])) {
                    $u = $matches[0];
                    if (!is_youtube_url($u)) {
                        if (!check_url_existence_bot($u)) {
                            $bot->replyText($replyToken, "🚨 此網站目前無法連線！可能是釣魚網址！");
                        } else {
                            $res = check_url_safety($u, GOOGLE_WEB_RISK_API_KEY_CONST);
                            $msg = (isset($res['safe']) && $res['safe']) ? "" : "🚨 釣魚網址 (" . ($res['threat_type'] ?? 'SOCIAL_ENGINEERING') . ")";
                            $bot->replyText($replyToken, $msg);
                        }
                    }
                    continue;
                }
            }
        }
    }
}
echo 'OK';
?>