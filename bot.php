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

function getContentWithRetry($dataBot, $messageId) { $res = $dataBot->getMessageContent($messageId); if ($res->getHTTPStatus() === 202) { sleep(2); $res = $dataBot->getMessageContent($messageId); } return $res; }
function make_curl_request_with_files($url, $postData) { $ch = curl_init($url); curl_setopt($ch, CURLOPT_RETURNTRANSFER, true); curl_setopt($ch, CURLOPT_TIMEOUT, 600); curl_setopt($ch, CURLOPT_POST, true); curl_setopt($ch, CURLOPT_POSTFIELDS, $postData); $res = curl_exec($ch); ($ch); return $res; }
function make_curl_request($url, $postData=[]) { $ch = curl_init($url); curl_setopt($ch, CURLOPT_RETURNTRANSFER, true); curl_setopt($ch, CURLOPT_TIMEOUT, 600); if(!empty($postData)) { curl_setopt($ch, CURLOPT_POST, true); curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($postData)); } $res = curl_exec($ch); ($ch); return $res; }

// 狀態管理
function setUserState($uid, $st) { $d = file_exists(USER_STATE_FILE) ? json_decode(file_get_contents(USER_STATE_FILE), true) : []; $d[$uid] = $st; file_put_contents(USER_STATE_FILE, json_encode($d)); }
function getUserState($uid) { if (!file_exists(USER_STATE_FILE)) return null; $d = json_decode(file_get_contents(USER_STATE_FILE), true); return $d[$uid] ?? null; }
function clearUserState($uid) { $d = file_exists(USER_STATE_FILE) ? json_decode(file_get_contents(USER_STATE_FILE), true) : []; unset($d[$uid]); file_put_contents(USER_STATE_FILE, json_encode($d)); }

// 觸發判斷
function has_image_trigger($m) { return (mb_strpos($m, '分析') !== false || mb_strpos($m, '查') !== false) && (mb_strpos($m, '圖片') !== false || mb_strpos($m, '圖') !== false); }
function has_video_trigger($m) { return (mb_strpos($m, '分析') !== false || mb_strpos($m, '查') !== false) && (mb_strpos($m, '影片') !== false || mb_strpos($m, 'yt') !== false); }
function is_youtube_url($t) { if (preg_match('/(https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\/[^\s]+)/', $t, $m)) return $m[0]; return null; }

// --- 處理函式 ---

function handle_image_analysis_response($apiResponse, $targetId, $bot) {
    $data = json_decode($apiResponse, true);
    if (!$data || !is_array($data)) { $bot->pushMessage($targetId, new TextMessageBuilder("分析失敗，無法解析伺服器回應。")); return; }

    $msg = "🖼️ 圖片分析結果：\n\n";
    
    // AI 偵測
    if (isset($data['ai_detection']['fake_probability'])) {
        $fakeProb = $data['ai_detection']['fake_probability'];
        $percent = round($fakeProb * 100, 1);
        
        if ($fakeProb > 0.5) {
            $msg .= "⚠️ 判斷為：AI生成/Deepfake\n(合成可能性：{$percent}%)\n";
        } else {
            $msg .= "✅ 判斷為：真實影像\n(合成可能性僅 {$percent}%)\n";
        }
    } else {
        $msg .= "AI 偵測發生錯誤。\n";
    }

    // 查核結果
    $factData = $data['fact_check'] ?? null;
    if ($factData && !empty($factData['claims'])) {
        $msg .= "\n🔍 文字查核結果：\n";
        $claim = $factData['claims'][0];
        $msg .= "相關評等：「{$claim['claimReview'][0]['textualRating']}」\n";
        $msg .= "連結：{$claim['claimReview'][0]['url']}";
    } elseif ($factData && !empty($factData['extracted_text'])) {
        $msg .= "\n🔍 文字查核結果：\n圖片中的文字未找到相關查核報告。";
    }

    $bot->pushMessage($targetId, new TextMessageBuilder($msg));
}

function handle_video_analysis_response($apiResponse, $targetId, $bot) {
    $data = json_decode($apiResponse, true);
    if (!$data || !is_array($data)) { $bot->pushMessage($targetId, new TextMessageBuilder("分析失敗。")); return; }

    $msg = "🎬 影片 Deepfake 分析結果：\n\n";
    
    if (isset($data['deepfake']['prob'])) {
        $prob = $data['deepfake']['prob'];
        $percent = round($prob * 100, 1);
        
        if ($prob > 0.5) {
            $msg .= "⚠️ 判斷為：疑似 Deepfake\n(偵測到合成特徵：{$percent}%)\n";
        } else {
            $msg .= "✅ 判斷為：未檢測到明顯特徵\n(合成可能性：{$percent}%)\n";
        }
    } else {
        $msg .= "影片偵測發生錯誤 (" . ($data['error'] ?? '未知') . ")";
    }
    
    $bot->pushMessage($targetId, new TextMessageBuilder($msg));
}

// --- 主要邏輯 Loop ---
$input = file_get_contents('php://input');
$events = json_decode($input, true);
if (!empty($events['events'])) {
    foreach ($events['events'] as $event) {
        if ($event['type'] == 'message') {
            $replyToken = $event['replyToken'];
            $uid = $event['source']['userId'];
            $targetId = $event['source']['groupId'] ?? $uid;
            $apiUrl = 'https://a9c5958fe6e2.ngrok-free.app/api.php'; // 記得確認網址
            $userState = getUserState($uid);
            
            // 圖片上傳
            if ($event['message']['type'] === 'image' && $userState === 'awaiting_image') {
                $bot->replyText($replyToken, '收到圖片，正在分析...'); clearUserState($uid);
                $res = getContentWithRetry($dataBot, $event['message']['id']);
                if ($res->isSucceeded()) {
                    $tmp = 'uploads/' . uniqid() . '.jpg'; if(!is_dir('uploads')) mkdir('uploads'); file_put_contents($tmp, $res->getRawBody());
                    $resp = make_curl_request_with_files($apiUrl, ['action'=>'detect_image', 'image_file'=>new CURLFile($tmp)]);
                    handle_image_analysis_response($resp, $targetId, $bot); unlink($tmp);
                }
                continue;
            }
            
            // 影片上傳
            if ($event['message']['type'] === 'video' && $userState === 'awaiting_video') {
                $bot->replyText($replyToken, '收到影片，正在分析(可能需要較長時間)...'); clearUserState($uid);
                $res = getContentWithRetry($dataBot, $event['message']['id']);
                if ($res->isSucceeded()) {
                    $tmp = 'uploads/' . uniqid() . '.mp4'; if(!is_dir('uploads')) mkdir('uploads'); file_put_contents($tmp, $res->getRawBody());
                    $resp = make_curl_request_with_files($apiUrl, ['action'=>'detect_video', 'video_file'=>new CURLFile($tmp)]);
                    handle_video_analysis_response($resp, $targetId, $bot); unlink($tmp);
                }
                continue;
            }

            // 文字指令
            if ($event['message']['type'] === 'text') {
                $txt = trim($event['message']['text']);
                
                if ($txt == '取消') { clearUserState($uid); $bot->replyText($replyToken, '已取消。'); continue; }
                if ($txt == '測試') { $bot->replyText($replyToken, '連線正常！'); continue; }
                
                if (has_image_trigger($txt)) { setUserState($uid, 'awaiting_image'); $bot->replyText($replyToken, '請傳送圖片。'); continue; }
                if (has_video_trigger($txt)) { setUserState($uid, 'awaiting_video'); $bot->replyText($replyToken, '請傳送影片或 YouTube 網址。'); continue; }

                if ($userState === 'awaiting_video' && is_youtube_url($txt)) {
                    clearUserState($uid); $bot->replyText($replyToken, '收到 YouTube 連結，正在分析...');
                    $resp = make_curl_request($apiUrl, ['action'=>'detect_yt_video', 'video_url'=>$txt]);
                    handle_video_analysis_response($resp, $targetId, $bot); continue;
                }
                
                // 網址檢查
                if (filter_var($txt, FILTER_VALIDATE_URL) && !is_youtube_url($txt)) {
                     $resp = make_curl_request($apiUrl, ['action'=>'check_url', 'url'=>$txt]);
                     $d = json_decode($resp, true);
                     if ($d && isset($d['safe'])) {
                         $msg = $d['safe'] ? "✅ 網址安全 (Google Web Risk)" : "🚨 危險！偵測到威脅 ({$d['threat_type']})";
                         $bot->replyText($replyToken, $msg);
                     }
                     continue;
                }
            }
        }
    }
}
echo 'OK';
?>