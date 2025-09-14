<?php
// error_reporting(0); // disable in production
if (getenv('APP_ENV') === 'production') {
    error_reporting(0);
} else {
    error_reporting(E_ALL);
    ini_set('display_errors', 1);
}
//Import PHPMailer classes into the global namespace
use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

if(!empty($_SERVER['HTTP_X_REQUESTED_WITH']) && strtolower($_SERVER['HTTP_X_REQUESTED_WITH']) == 'xmlhttprequest') {
    require 'vendor/autoload.php';
    require 'config.php';

    // Sanitize input fields
    $email   = filter_var($_POST['email'] ?? '', FILTER_SANITIZE_EMAIL);
    $name    = htmlspecialchars(trim($_POST['name'] ?? ''), ENT_QUOTES, 'UTF-8');
    $subject = htmlspecialchars(trim($_POST['subject'] ?? ''), ENT_QUOTES, 'UTF-8');
    $message = htmlspecialchars(trim($_POST['message'] ?? ''), ENT_QUOTES, 'UTF-8');

    // Strip unexpected control characters from subject and message
    $subject = preg_replace('/[\x00-\x09\x0B-\x0C\x0E-\x1F\x7F]/', '', $subject);
    $message = preg_replace('/[\x00-\x09\x0B-\x0C\x0E-\x1F\x7F]/', '', $message);

    // Validate required fields
    if (!filter_var($email, FILTER_VALIDATE_EMAIL) || $name === '' || $subject === '' || $message === '') {
        echo json_encode(['status' => false, 'data' => 'Invalid input']);
        exit;
    }

    $mail = new PHPMailer(true);
    try {
        //Server settings
        $mail->isSMTP();
        $mail->Host = $config['host'];
        $mail->SMTPAuth = true;
        $mail->Username = $config['username'];
        $mail->Password = $config['password'];
        $mail->SMTPSecure = $config['secure'];
        $mail->Port = $config['port'];

        //Recipients
        $mail->setFrom($config['from'], $config['fromName']);
        $mail->addAddress($config['sendTo']);
        $mail->addAddress($email);

        //Content
        $mail->isHTML(true);
        $mail->Subject = $subject;
        $mail->Body    = '<p>Name: ' . $name . '</p>'
            . '<p>Email: ' . $email . '</p>'
            . '<p>Message: ' . nl2br($message) . '</p>';

        $mail->send();
        echo json_encode(['status' => true, 'data' => 'Message has been sent']);
    } catch (Exception $e) {
        echo json_encode(['status' => false, 'data' => 'Message could not be sent\nMailer Error: ' . $mail->ErrorInfo]);
    }
} else {
    echo '<h1>Access forbidden, kids!</h1>';
}
