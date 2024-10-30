const TelegramBot = require('node-telegram-bot-api');
const { exec } = require('child_process');
const fs = require('fs');

// Замените 'YOUR_TELEGRAM_BOT_TOKEN' на ваш токен
const token = '8013205912:AAFgLNU5TvRaAjJhazaS3HzIVK-PxH6QyOg';
const bot = new TelegramBot(token, { polling: true });

// Объект для хранения сообщений на разных языках
const messages = {
    en: {
        startHelp: "Send me a YouTube link and I will convert it to MP3 for you!",
        processing: "Downloading and converting video, please wait...",
        error: "An error occurred. Please try again.",
        invalidLink: "Please send a valid YouTube link.",
        success: "Here is your MP3 file:",
        videoSent: "Here is your original video file:",
        limitExceeded: "The video is longer than 1 hour. Please send a shorter video.",
    },
    ru: {
        startHelp: "Отправьте мне ссылку на YouTube, и я конвертирую ее в MP3 для вас!",
        processing: "Загрузка и конвертация видео, подождите немного...",
        error: "Произошла ошибка. Пожалуйста, попробуйте снова.",
        invalidLink: "Пожалуйста, отправьте действительную ссылку на YouTube.",
        success: "Вот ваш MP3 файл:",
        videoSent: "Вот ваш оригинальный видео файл:",
        limitExceeded: "Видео длиннее 1 часа. Пожалуйста, отправьте более короткое видео.",
    },
    uz: {
        startHelp: "Menga YouTube havolasini yuboring va men uni MP3 ga aylantiraman!",
        processing: "Video yuklanmoqda va konvertatsiya qilinmoqda, iltimos kuting...",
        error: "Xato yuz berdi. Iltimos, qayta urinib ko'ring.",
        invalidLink: "Iltimos, haqiqiy YouTube havolasini yuboring.",
        success: "Mana sizning MP3 faylingiz:",
        videoSent: "Mana sizning asl video faylingiz:",
        limitExceeded: "Video 1 soatdan uzun. Iltimos, qisqaroq videoni yuboring.",
    }
};

// Объект для хранения языка пользователя
const userLanguages = {};

// Функция для отправки сообщения об ошибке
const sendErrorMessage = (chatId, language) => {
    bot.sendMessage(chatId, messages[language].error);
};

// Обработка команды /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;

    // Установка языка по умолчанию (например, английский)
    userLanguages[chatId] = 'en';

    // Создание кнопок для выбора языка
    const options = {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: "English", callback_data: 'en' },
                    { text: "Русский", callback_data: 'ru' },
                    { text: "Oʻzbek", callback_data: 'uz' }
                ]
            ]
        }
    };

    bot.sendMessage(chatId, "Please choose your language:", options);
});

// Обработка выбора языка
bot.on('callback_query', (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const language = callbackQuery.data;

    // Сохранение выбранного языка
    userLanguages[chatId] = language;

    // Отправка приветственного сообщения
    bot.sendMessage(chatId, messages[language].startHelp);
});

// Получение языка пользователя
const getUserLanguage = (chatId) => {
    return userLanguages[chatId] || 'en'; // Возврат языка по умолчанию, если он не установлен
};

// Обработка сообщений с YouTube ссылками
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const language = getUserLanguage(chatId);

    if (msg.text && msg.text.startsWith('http')) {
        bot.sendMessage(chatId, messages[language].processing);

        const outputFileNameMP3 = `./downloads/${Date.now()}.mp3`;
        const outputFileNameVideo = `./downloads/${Date.now()}.mp4`; // Имя файла для видео

        // Команда для получения информации о видео (для проверки длительности)
        exec(`yt-dlp --get-duration "${msg.text}"`, (error, durationOutput, stderr) => {
            if (error) {
                console.error(`Ошибка при получении длительности: ${stderr}`);
                return sendErrorMessage(chatId, language);
            }

            // Проверка длительности видео (в секундах)
            const duration = parseDuration(durationOutput.trim());
            if (duration > 3600) {
                return bot.sendMessage(chatId, messages[language].limitExceeded);
            }

            // Команда для загрузки видео
            exec(`yt-dlp -f bestvideo -o "${outputFileNameVideo}" "${msg.text}"`, (error) => {
                if (error) {
                    console.error(`Ошибка при загрузке видео: ${stderr}`);
                    return sendErrorMessage(chatId, language);
                }

                // Команда для конвертации в MP3
                exec(`yt-dlp -x --audio-format mp3 -o "${outputFileNameMP3}" "${msg.text}"`, (error, stdout, stderr) => {
                    if (error) {
                        console.error(`Ошибка: ${stderr}`);
                        return sendErrorMessage(chatId, language);
                    }

                    // Отправка MP3 файла
                    bot.sendAudio(chatId, outputFileNameMP3, {}, {
                        filename: "audio.mp3",
                        contentType: "audio/mpeg",
                    }).then(() => {
                        // Удаление MP3 файла после отправки
                        fs.unlink(outputFileNameMP3, (err) => {
                            if (err) console.error(`Ошибка при удалении MP3 файла: ${err}`);
                        });

                        // Отправка видео файла
                        return bot.sendVideo(chatId, outputFileNameVideo, {}, {
                            filename: "video.mp4",
                            contentType: "video/mp4",
                        });
                    }).then(() => {
                        // Удаление видео файла после отправки
                        fs.unlink(outputFileNameVideo, (err) => {
                            if (err) console.error(`Ошибка при удалении видео файла: ${err}`);
                        });
                    }).catch(() => sendErrorMessage(chatId, language));
                });
            });
        });
    } else {
        bot.sendMessage(chatId, messages[language].invalidLink);
    }
});

// Функция для преобразования строки длительности в секунды
const parseDuration = (durationString) => {
    const parts = durationString.split(':').map(Number);
    let seconds = 0;
    if (parts.length === 3) {
        seconds += parts[0] * 3600; // Часы
        seconds += parts[1] * 60;   // Минуты
        seconds += parts[2];        // Секунды
    } else if (parts.length === 2) {
        seconds += parts[0] * 60;   // Минуты
        seconds += parts[1];        // Секунды
    } else if (parts.length === 1) {
        seconds += parts[0];        // Секунды
    }
    return seconds;
};

// Глобальная обработка ошибок
process.on('uncaughtException', (err) => {
    console.error(`Необработанное исключение: ${err.message}`);
});
