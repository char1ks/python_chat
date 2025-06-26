from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit, join_room, leave_room
import uuid
from datetime import datetime
import json
import os
import redis
import hashlib

app = Flask(__name__)
app.config['SECRET_KEY'] = 'distributed-chat-secret-key'
socketio = SocketIO(app, cors_allowed_origins="*")

# Конфигурация
USE_REDIS = os.getenv('USE_REDIS', 'false').lower() == 'true'
BACKEND_ID = os.getenv('BACKEND_ID', '1')
REDIS_HOST = os.getenv('REDIS_HOST', 'localhost')
REDIS_PORT = int(os.getenv('REDIS_PORT', 6379))

# Инициализация Redis если нужно
redis_client = None
if USE_REDIS:
    try:
        redis_client = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)
        redis_client.ping()
        print(f"✅ Backend {BACKEND_ID}: Connected to Redis")
    except:
        print(f"❌ Backend {BACKEND_ID}: Failed to connect to Redis")
        redis_client = None

# Локальное хранение
active_users = {}
chat_history = []  # Общий чат для всех

print(f"🚀 Backend {BACKEND_ID} started (Redis: {USE_REDIS})")

@app.route('/')
def index():
    return render_template('index.html', backend_id=BACKEND_ID)

@app.route('/health')
def health():
    return {'status': 'ok', 'backend_id': BACKEND_ID, 'redis': USE_REDIS}

def save_message_to_storage(message_data):
    """Сохраняет сообщение в локальную память или Redis"""
    if USE_REDIS and redis_client:
        try:
            # Добавляем к истории в Redis
            chat_key = "chat_history"
            redis_client.lpush(chat_key, json.dumps(message_data))
            redis_client.ltrim(chat_key, 0, 99)  # Ограничиваем до 100 сообщений
            print(f"📝 Backend {BACKEND_ID}: Saved to Redis")
        except Exception as e:
            print(f"❌ Backend {BACKEND_ID}: Redis error: {e}")
            # Fallback to local storage
            chat_history.append(message_data)
    else:
        # Локальное хранение
        chat_history.append(message_data)
        if len(chat_history) > 100:
            chat_history[:] = chat_history[-100:]

def get_chat_history():
    """Получает историю чата из хранилища"""
    if USE_REDIS and redis_client:
        try:
            chat_key = "chat_history"
            messages = redis_client.lrange(chat_key, 0, -1)
            history = [json.loads(msg) for msg in reversed(messages)]
            print(f"📖 Backend {BACKEND_ID}: Loaded {len(history)} messages from Redis")
            return history
        except Exception as e:
            print(f"❌ Backend {BACKEND_ID}: Redis error: {e}")
            return chat_history
    else:
        return chat_history

@socketio.on('connect')
def on_connect():
    print(f'👤 Backend {BACKEND_ID}: User connected: {request.sid}')

@socketio.on('disconnect')
def on_disconnect():
    print(f'👋 Backend {BACKEND_ID}: User disconnected: {request.sid}')
    if request.sid in active_users:
        user_info = active_users[request.sid]
        username = user_info['username']
        
        del active_users[request.sid]
        
        # Уведомляем всех о выходе
        emit('user_left', {
            'username': username,
            'backend_id': BACKEND_ID
        }, broadcast=True)
        
        # Обновляем счетчик пользователей
        emit('user_count', {
            'count': len(active_users),
            'backend_id': BACKEND_ID
        }, broadcast=True)

@socketio.on('join_chat')
def on_join_chat(data):
    username = data['username']
    user_id = str(uuid.uuid4())
    
    active_users[request.sid] = {
        'username': username,
        'user_id': user_id,
        'joined_at': datetime.now().isoformat()
    }
    
    print(f"🎯 Backend {BACKEND_ID}: {username} joined chat")
    
    # Уведомляем всех о новом участнике
    emit('user_joined', {
        'username': username,
        'user_id': user_id,
        'backend_id': BACKEND_ID
    }, broadcast=True)
    
    # Отправляем счетчик пользователей
    emit('user_count', {
        'count': len(active_users),
        'backend_id': BACKEND_ID
    }, broadcast=True)
    
    # Отправляем историю сообщений
    history = get_chat_history()
    emit('chat_history', {
        'messages': history,
        'backend_id': BACKEND_ID
    })

@socketio.on('send_message')
def handle_message(data):
    if request.sid in active_users:
        user_info = active_users[request.sid]
        
        message_data = {
            'username': user_info['username'],
            'user_id': user_info['user_id'],
            'message': data['message'],
            'timestamp': datetime.now().isoformat(),
            'message_id': str(uuid.uuid4()),
            'backend_id': BACKEND_ID
        }
        
        # Сохраняем сообщение
        save_message_to_storage(message_data)
        
        # Отправляем сообщение всем пользователям
        emit('new_message', message_data, broadcast=True)
        
        print(f"💬 Backend {BACKEND_ID}: Message from {user_info['username']}")

@socketio.on('send_emoji_animation')
def handle_emoji_animation(data):
    if request.sid in active_users:
        user_info = active_users[request.sid]
        
        animation_data = {
            'username': user_info['username'],
            'emoji': data['emoji'],
            'animation_id': str(uuid.uuid4()),
            'timestamp': datetime.now().isoformat(),
            'backend_id': BACKEND_ID
        }
        
        # Отправляем анимацию всем пользователям
        emit('emoji_animation', animation_data, broadcast=True)

@socketio.on('send_special_effect')
def handle_special_effect(data):
    if request.sid in active_users:
        user_info = active_users[request.sid]
        
        effect_data = {
            'username': user_info['username'],
            'effect_type': data['effect_type'],
            'effect_id': str(uuid.uuid4()),
            'timestamp': datetime.now().isoformat(),
            'backend_id': BACKEND_ID
        }
        
        # Отправляем эффект всем пользователям
        emit('special_effect', effect_data, broadcast=True)

@socketio.on('typing_start')
def handle_typing_start():
    if request.sid in active_users:
        user_info = active_users[request.sid]
        
        emit('user_typing', {
            'username': user_info['username'],
            'typing': True,
            'backend_id': BACKEND_ID
        }, broadcast=True, include_self=False)

@socketio.on('typing_stop')
def handle_typing_stop():
    if request.sid in active_users:
        user_info = active_users[request.sid]
        
        emit('user_typing', {
            'username': user_info['username'],
            'typing': False,
            'backend_id': BACKEND_ID
        }, broadcast=True, include_self=False)

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    socketio.run(app, debug=True, host='0.0.0.0', port=port) 