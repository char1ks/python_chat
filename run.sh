#!/bin/bash

echo "🚀 Запускаем Супер Чат с Анимациями!"
echo ""

# Проверяем наличие Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker не установлен. Установите Docker и попробуйте снова."
    exit 1
fi

# Останавливаем предыдущий контейнер если он запущен
echo "🛑 Останавливаем предыдущие контейнеры..."
docker-compose down 2>/dev/null

# Собираем и запускаем контейнер
echo "🔨 Собираем Docker образ..."
docker-compose build

echo "🌟 Запускаем чат..."
docker-compose up -d

echo ""
echo "✅ Чат запущен!"
echo "🌐 Откройте браузер и перейдите по адресу:"
echo "   http://localhost:5000"
echo ""
echo "📝 Для остановки выполните: docker-compose down"
echo "📊 Для просмотра логов: docker-compose logs -f" 