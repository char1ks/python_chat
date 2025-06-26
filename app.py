from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit, join_room, leave_room
import uuid
from datetime import datetime
import json

app = Flask(__name__)
app.config['SECRET_KEY'] = 'your-secret-key-here'
socketio = SocketIO(app, cors_allowed_origins="*")

# Хранение активных пользователей
active_users = {}
chat_rooms = {'general': []}
typing_users = {}  # Хранение пользователей, которые печатают

@app.route('/')
def index():
    return render_template('index.html')

@socketio.on('connect')
def on_connect():
    print(f'Пользователь подключился: {request.sid}')

@socketio.on('disconnect')
def on_disconnect():
    print(f'Пользователь отключился: {request.sid}')
    if request.sid in active_users:
        username = active_users[request.sid]['username']
        del active_users[request.sid]
        
        # Убираем пользователя из списка печатающих
        if request.sid in typing_users:
            del typing_users[request.sid]
            emit('user_typing', {
                'username': username,
                'typing': False
            }, broadcast=True)
        
        emit('user_left', {'username': username}, broadcast=True)
        emit('user_count', {'count': len(active_users)}, broadcast=True)

@socketio.on('join_chat')
def on_join_chat(data):
    username = data['username']
    user_id = str(uuid.uuid4())
    
    active_users[request.sid] = {
        'username': username,
        'user_id': user_id,
        'joined_at': datetime.now().isoformat()
    }
    
    join_room('general')
    
    # Отправляем приветственное сообщение
    emit('user_joined', {
        'username': username,
        'user_id': user_id
    }, broadcast=True)
    
    # Отправляем количество пользователей
    emit('user_count', {'count': len(active_users)}, broadcast=True)
    
    # Отправляем историю сообщений новому пользователю
    emit('chat_history', {'messages': chat_rooms['general']})

@socketio.on('send_message')
def handle_message(data):
    if request.sid in active_users:
        user_info = active_users[request.sid]
        message_data = {
            'username': user_info['username'],
            'user_id': user_info['user_id'],
            'message': data['message'],
            'timestamp': datetime.now().isoformat(),
            'message_id': str(uuid.uuid4())
        }
        
        # Сохраняем сообщение в историю
        chat_rooms['general'].append(message_data)
        
        # Ограничиваем историю до 100 сообщений
        if len(chat_rooms['general']) > 100:
            chat_rooms['general'] = chat_rooms['general'][-100:]
        
        # Отправляем сообщение всем пользователям
        emit('new_message', message_data, broadcast=True)

@socketio.on('send_emoji_animation')
def handle_emoji_animation(data):
    if request.sid in active_users:
        user_info = active_users[request.sid]
        animation_data = {
            'username': user_info['username'],
            'emoji': data['emoji'],
            'animation_id': str(uuid.uuid4()),
            'timestamp': datetime.now().isoformat()
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
            'timestamp': datetime.now().isoformat()
        }
        
        # Отправляем эффект всем пользователям
        emit('special_effect', effect_data, broadcast=True)

@socketio.on('typing_start')
def handle_typing_start():
    if request.sid in active_users:
        user_info = active_users[request.sid]
        typing_users[request.sid] = user_info['username']
        
        # Отправляем информацию о том, кто печатает
        emit('user_typing', {
            'username': user_info['username'],
            'typing': True
        }, broadcast=True, include_self=False)

@socketio.on('typing_stop')
def handle_typing_stop():
    if request.sid in active_users and request.sid in typing_users:
        user_info = active_users[request.sid]
        del typing_users[request.sid]
        
        # Отправляем информацию о том, что пользователь перестал печатать
        emit('user_typing', {
            'username': user_info['username'],
            'typing': False
        }, broadcast=True, include_self=False)

if __name__ == '__main__':
    socketio.run(app, debug=True, host='0.0.0.0', port=5000) 