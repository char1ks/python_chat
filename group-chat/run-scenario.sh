#!/bin/bash

SCENARIO=${1:-1}

echo "🎭 Запуск сценария $SCENARIO распределенного чата"

# Останавливаем все контейнеры
echo "🛑 Останавливаем предыдущие контейнеры..."
docker-compose -f docker-compose.scenario-1.yml down 2>/dev/null
docker-compose -f docker-compose.scenario-3.yml down 2>/dev/null
docker-compose -f docker-compose.scenario-5.yml down 2>/dev/null

case $SCENARIO in
    1)
        echo "📘 СЦЕНАРИЙ 1: Один бэкэнд, локальная память"
        echo "   - Один backend сервис"
        echo "   - Nginx балансировщик"
        echo "   - История хранится в памяти"
        echo "   - НЕТ Redis"
        docker-compose -f docker-compose.scenario-1.yml up -d
        ;;
    2)
        echo "💥 СЦЕНАРИЙ 2: Имитация падения бэкэнда"
        echo "   Запускаем сценарий 1, затем через 30 сек останавливаем backend"
        docker-compose -f docker-compose.scenario-1.yml up -d
        echo "⏰ Бэкэнд упадет через 30 секунд..."
        sleep 30
        echo "💥 ПАДЕНИЕ! Останавливаем backend1..."
        docker-compose -f docker-compose.scenario-1.yml stop backend1
        echo "❌ Сервис недоступен! Для восстановления запустите сценарий 3"
        ;;
    3)
        echo "📗 СЦЕНАРИЙ 3: Два бэкэнда + sticky sessions + Redis"
        echo "   - Два backend сервиса"
        echo "   - Sticky sessions по IP hash"
        echo "   - Redis для хранения истории"
        echo "   - Каждый backend аппендит свои сообщения"
        docker-compose -f docker-compose.scenario-3.yml up -d
        ;;
    4)
        echo "💥💥 СЦЕНАРИЙ 4: Имитация полного падения"
        echo "   Запускаем сценарий 3, затем через 30 сек останавливаем всё"
        docker-compose -f docker-compose.scenario-3.yml up -d
        echo "⏰ Полное падение через 30 секунд..."
        sleep 30
        echo "💥💥 ПОЛНОЕ ПАДЕНИЕ! Останавливаем все сервисы..."
        docker-compose -f docker-compose.scenario-3.yml down
        echo "❌ Система полностью недоступна! Для восстановления запустите сценарий 5"
        ;;
    5)
        echo "📙 СЦЕНАРИЙ 5: Кластер восстановлен + балансировка по chat_id"
        echo "   - Два backend сервиса"
        echo "   - Балансировка по chat_id (все в чат 1)"
        echo "   - Redis для истории"
        echo "   - Полная история восстановлена!"
        docker-compose -f docker-compose.scenario-5.yml up -d
        ;;
    *)
        echo "❌ Неизвестный сценарий: $SCENARIO"
        echo "Доступные сценарии: 1, 2, 3, 4, 5"
        exit 1
        ;;
esac

if [ "$SCENARIO" != "2" ] && [ "$SCENARIO" != "4" ]; then
    echo ""
    echo "✅ Сценарий $SCENARIO запущен!"
    echo "🌐 Откройте браузер: http://localhost"
    echo "📊 Мониторинг: docker-compose logs -f"
    echo "🛑 Остановка: ./run-scenario.sh stop"
fi 