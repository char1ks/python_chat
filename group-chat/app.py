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
local_chat_history = {'group_1': [], 'group_2': []}
user_groups = {}  # Автоматическое распределение пользователей

print(f"🚀 Backend {BACKEND_ID} started (Redis: {USE_REDIS})")

@app.route('/')
def index():
    return render_template('index.html', backend_id=BACKEND_ID)

@app.route('/health')
def health():
    return {'status': 'ok', 'backend_id': BACKEND_ID, 'redis': USE_REDIS}

def get_user_group(user_id):
    """Автоматически определяет группу пользователя"""
    if user_id in user_groups:
        return user_groups[user_id]
    
    # Определяем группу по hash от user_id для consistency
    group_num = int(hashlib.md5(user_id.encode()).hexdigest(), 16) % 2 + 1
    group = f'group_{group_num}'
    user_groups[user_id] = group
    return group

def save_message_to_storage(group, message_data):
    """Сохраняет сообщение в локальную память или Redis"""
    if USE_REDIS and redis_client:
        try:
            # Добавляем к истории в Redis
            chat_key = f"chat_history:{group}"
            redis_client.lpush(chat_key, json.dumps(message_data))
            redis_client.ltrim(chat_key, 0, 99)  # Ограничиваем до 100 сообщений
            print(f"📝 Backend {BACKEND_ID}: Saved to Redis group {group}")
        except Exception as e:
            print(f"❌ Backend {BACKEND_ID}: Redis error: {e}")
            # Fallback to local storage
            local_chat_history[group].append(message_data)
    else:
        # Локальное хранение
        local_chat_history[group].append(message_data)
        if len(local_chat_history[group]) > 100:
            local_chat_history[group] = local_chat_history[group][-100:]

def get_chat_history(group):
    """Получает историю чата из хранилища"""
    if USE_REDIS and redis_client:
        try:
            chat_key = f"chat_history:{group}"
            messages = redis_client.lrange(chat_key, 0, -1)
            history = [json.loads(msg) for msg in reversed(messages)]
            print(f"📖 Backend {BACKEND_ID}: Loaded {len(history)} messages from Redis for {group}")
            return history
        except Exception as e:
            print(f"❌ Backend {BACKEND_ID}: Redis error: {e}")
            return local_chat_history.get(group, [])
    else:
        return local_chat_history.get(group, [])

@socketio.on('connect')
def on_connect():
    print(f'👤 Backend {BACKEND_ID}: User connected: {request.sid}')

@socketio.on('disconnect')
def on_disconnect():
    print(f'👋 Backend {BACKEND_ID}: User disconnected: {request.sid}')
    if request.sid in active_users:
        user_info = active_users[request.sid]
        group = user_info['group']
        username = user_info['username']
        
        del active_users[request.sid]
        
        # Уведомляем группу о выходе
        emit('user_left', {
            'username': username,
            'backend_id': BACKEND_ID
        }, room=group)
        
        # Обновляем счетчик пользователей для группы
        group_users = [u for u in active_users.values() if u['group'] == group]
        emit('user_count', {
            'count': len(group_users),
            'group': group,
            'backend_id': BACKEND_ID
        }, room=group)

@socketio.on('join_chat')
def on_join_chat(data):
    username = data['username']
    user_id = str(uuid.uuid4())
    
    # Автоматически определяем группу
    group = get_user_group(user_id)
    
    active_users[request.sid] = {
        'username': username,
        'user_id': user_id,
        'group': group,
        'joined_at': datetime.now().isoformat()
    }
    
    # Присоединяем к комнате группы
    join_room(group)
    
    print(f"🎯 Backend {BACKEND_ID}: {username} joined {group}")
    
    # Отправляем информацию о группе пользователю
    emit('group_assigned', {
        'group': group,
        'backend_id': BACKEND_ID,
        'username': username
    })
    
    # Уведомляем группу о новом участнике
    emit('user_joined', {
        'username': username,
        'user_id': user_id,
        'group': group,
        'backend_id': BACKEND_ID
    }, room=group)
    
    # Отправляем счетчик пользователей группы
    group_users = [u for u in active_users.values() if u['group'] == group]
    emit('user_count', {
        'count': len(group_users),
        'group': group,
        'backend_id': BACKEND_ID
    }, room=group)
    
    # Отправляем историю сообщений группы
    history = get_chat_history(group)
    emit('chat_history', {
        'messages': history,
        'group': group,
        'backend_id': BACKEND_ID
    })

@socketio.on('send_message')
def handle_message(data):
    if request.sid in active_users:
        user_info = active_users[request.sid]
        group = user_info['group']
        
        message_data = {
            'username': user_info['username'],
            'user_id': user_info['user_id'],
            'message': data['message'],
            'timestamp': datetime.now().isoformat(),
            'message_id': str(uuid.uuid4()),
            'group': group,
            'backend_id': BACKEND_ID
        }
        
        # Сохраняем сообщение
        save_message_to_storage(group, message_data)
        
        # Отправляем сообщение всем пользователям группы
        emit('new_message', message_data, room=group)
        
        print(f"💬 Backend {BACKEND_ID}: Message in {group} from {user_info['username']}")

@socketio.on('send_emoji_animation')
def handle_emoji_animation(data):
    if request.sid in active_users:
        user_info = active_users[request.sid]
        group = user_info['group']
        
        animation_data = {
            'username': user_info['username'],
            'emoji': data['emoji'],
            'animation_id': str(uuid.uuid4()),
            'timestamp': datetime.now().isoformat(),
            'group': group,
            'backend_id': BACKEND_ID
        }
        
        # Отправляем анимацию всем пользователям группы
        emit('emoji_animation', animation_data, room=group)

@socketio.on('send_special_effect')
def handle_special_effect(data):
    if request.sid in active_users:
        user_info = active_users[request.sid]
        group = user_info['group']
        
        effect_data = {
            'username': user_info['username'],
            'effect_type': data['effect_type'],
            'effect_id': str(uuid.uuid4()),
            'timestamp': datetime.now().isoformat(),
            'group': group,
            'backend_id': BACKEND_ID
        }
        
        # Отправляем эффект всем пользователям группы
        emit('special_effect', effect_data, room=group)

@socketio.on('typing_start')
def handle_typing_start():
    if request.sid in active_users:
        user_info = active_users[request.sid]
        group = user_info['group']
        
        emit('user_typing', {
            'username': user_info['username'],
            'typing': True,
            'group': group,
            'backend_id': BACKEND_ID
        }, room=group, include_self=False)

@socketio.on('typing_stop')
def handle_typing_stop():
    if request.sid in active_users:
        user_info = active_users[request.sid]
        group = user_info['group']
        
        emit('user_typing', {
            'username': user_info['username'],
            'typing': False,
            'group': group,
            'backend_id': BACKEND_ID
        }, room=group, include_self=False)

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    socketio.run(app, debug=True, host='0.0.0.0', port=port) 