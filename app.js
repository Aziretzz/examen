// ==========================================
// FIREBASE IMPORTS
// ==========================================
import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

import { 
    collection, 
    doc, 
    setDoc, 
    getDoc, 
    getDocs, 
    addDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    serverTimestamp 
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// ==========================================
// ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// ==========================================
let currentUser = null;

// ==========================================
// ПЕРЕКЛЮЧЕНИЕ ТАБОВ
// ==========================================
window.showTab = function(tabName) {
    const tabs = document.querySelectorAll('.tab');
    const forms = document.querySelectorAll('.form-container');
    
    tabs.forEach(tab => tab.classList.remove('active'));
    forms.forEach(form => form.classList.remove('active'));
    
    event.target.classList.add('active');
    document.getElementById(tabName + 'Form').classList.add('active');
    hideMessage();
};

// ==========================================
// ПОКАЗ/СКРЫТИЕ ВЫБОРА ГРУППЫ И КУРСА
// ==========================================
window.toggleGroupSelect = async function() {
    const role = document.getElementById('registerRole').value;
    const groupContainer = document.getElementById('groupSelectContainer');
    const courseContainer = document.getElementById('courseSelectContainer');
    
    if (role === 'student') {
        courseContainer.style.display = 'block';
        groupContainer.style.display = 'block';
        await loadGroups();
    } else {
        courseContainer.style.display = 'none';
        groupContainer.style.display = 'none';
    }
};

// ==========================================
// ЗАГРУЗКА ГРУПП
// ==========================================
async function loadGroups() {
    try {
        const groupSelect = document.getElementById('registerGroup');
        groupSelect.innerHTML = '<option value="">Загрузка...</option>';
        
        const groupsSnapshot = await getDocs(collection(window.db, 'groups'));
        
        if (groupsSnapshot.empty) {
            groupSelect.innerHTML = '<option value="">Нет доступных групп</option>';
            return;
        }
        
        groupSelect.innerHTML = '<option value="">Выберите группу</option>';
        groupsSnapshot.forEach(doc => {
            const group = doc.data();
            const option = document.createElement('option');
            option.value = doc.id;
            option.textContent = group.name;
            groupSelect.appendChild(option);
        });
    } catch (error) {
        console.error('Ошибка загрузки групп:', error);
        showMessage('Ошибка загрузки групп: ' + error.message, 'error');
    }
}

// ==========================================
// ВХОД
// ==========================================
window.handleLogin = async function(event) {
    event.preventDefault();
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    try {
        showMessage('Вход...', 'success');
        
        const userCredential = await signInWithEmailAndPassword(window.auth, email, password);
        const user = userCredential.user;
        
        // Получаем данные пользователя
        const userDoc = await getDoc(doc(window.db, 'users', user.uid));
        if (!userDoc.exists()) {
            throw new Error('Данные пользователя не найдены');
        }
        
        currentUser = { uid: user.uid, ...userDoc.data() };
        
        // Перенаправляем на dashboard
        redirectToDashboard();
        
    } catch (error) {
        console.error('Ошибка входа:', error);
        let errorMessage = 'Ошибка входа';
        
        if (error.code === 'auth/user-not-found') {
            errorMessage = 'Пользователь не найден';
        } else if (error.code === 'auth/wrong-password') {
            errorMessage = 'Неверный пароль';
        } else if (error.code === 'auth/invalid-email') {
            errorMessage = 'Неверный формат email';
        }
        
        showMessage(errorMessage, 'error');
    }
};

// ==========================================
// РЕГИСТРАЦИЯ
// ==========================================
window.handleRegister = async function(event) {
    event.preventDefault();
    
    const name = document.getElementById('registerName').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const role = document.getElementById('registerRole').value;
    const groupId = role === 'student' ? document.getElementById('registerGroup').value : null;
    const course = role === 'student' ? parseInt(document.getElementById('registerCourse').value) : null;
    
    if (role === 'student' && !groupId) {
        showMessage('Пожалуйста, выберите группу', 'error');
        return;
    }
    
    if (role === 'student' && !course) {
        showMessage('Пожалуйста, выберите курс', 'error');
        return;
    }
    
    try {
        showMessage('Регистрация...', 'success');
        
        // Создаём пользователя
        const userCredential = await createUserWithEmailAndPassword(window.auth, email, password);
        const user = userCredential.user;
        
        // Сохраняем данные в Firestore
        await setDoc(doc(window.db, 'users', user.uid), {
            email: email,
            fullName: name,
            role: role,
            groupId: groupId,
            course: course,
            createdAt: serverTimestamp()
        });
        
        showMessage('Регистрация успешна! Сейчас войдём...', 'success');
        
        currentUser = {
            uid: user.uid,
            email: email,
            fullName: name,
            role: role,
            groupId: groupId,
            course: course
        };
        
        // Перенаправляем на dashboard
        setTimeout(() => redirectToDashboard(), 1000);
        
    } catch (error) {
        console.error('Ошибка регистрации:', error);
        let errorMessage = 'Ошибка регистрации';
        
        if (error.code === 'auth/email-already-in-use') {
            errorMessage = 'Этот email уже используется';
        } else if (error.code === 'auth/weak-password') {
            errorMessage = 'Слишком слабый пароль (минимум 6 символов)';
        } else if (error.code === 'auth/invalid-email') {
            errorMessage = 'Неверный формат email';
        }
        
        showMessage(errorMessage, 'error');
    }
};

// ==========================================
// ПЕРЕНАПРАВЛЕНИЕ НА DASHBOARD
// ==========================================
function redirectToDashboard() {
    if (currentUser.role === 'teacher') {
        window.location.href = 'teacher.html';
    } else {
        window.location.href = 'student.html';
    }
}

// ==========================================
// ПОКАЗ СООБЩЕНИЙ
// ==========================================
function showMessage(text, type) {
    const messageDiv = document.getElementById('message');
    messageDiv.textContent = text;
    messageDiv.className = 'message ' + type;
}

function hideMessage() {
    const messageDiv = document.getElementById('message');
    messageDiv.className = 'message';
}

// ==========================================
// ПРОВЕРКА АВТОРИЗАЦИИ ПРИ ЗАГРУЗКЕ
// ==========================================
onAuthStateChanged(window.auth, async (user) => {
    if (user && window.location.pathname.includes('index.html')) {
        // Пользователь авторизован, получаем его данные
        const userDoc = await getDoc(doc(window.db, 'users', user.uid));
        if (userDoc.exists()) {
            currentUser = { uid: user.uid, ...userDoc.data() };
            redirectToDashboard();
        }
    }
});