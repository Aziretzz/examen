// ==========================================
// FIREBASE IMPORTS
// ==========================================
import {
    signOut,
    onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

import {
    collection,
    doc,
    getDoc,
    getDocs,
    addDoc,
    query,
    where,
    orderBy,
    serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// ==========================================
// ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// ==========================================
let currentUser = null;
let currentTest = null;
let currentQuestions = [];
let selectedAnswers = {};
let testStartTime = null;
let timerInterval = null;

// ==========================================
// ПРОВЕРКА АВТОРИЗАЦИИ
// ==========================================
onAuthStateChanged(window.auth, async (user) => {
    if (!user) {
        window.location.href = 'index.html';
        return;
    }

    const userDoc = await getDoc(doc(window.db, 'users', user.uid));
    if (!userDoc.exists() || userDoc.data().role !== 'student') {
        window.location.href = 'index.html';
        return;
    }

    currentUser = { uid: user.uid, ...userDoc.data() };
    initStudentDashboard();
});

// ==========================================
// ИНИЦИАЛИЗАЦИЯ DASHBOARD
// ==========================================
async function initStudentDashboard() {
    document.getElementById('userName').textContent = currentUser.fullName;
    document.getElementById('userEmail').textContent = currentUser.email;

    // Получаем название группы
    const groupDoc = await getDoc(doc(window.db, 'groups', currentUser.groupId));
    document.getElementById('groupName').textContent = groupDoc.exists() ? groupDoc.data().name : 'Неизвестная группа';

    // Отображаем курс
    document.getElementById('courseName').textContent = currentUser.course ? `${currentUser.course} курс` : 'Не указан';

    await loadAvailableTests();
    await loadResults();
    await updateStats();
}

// ==========================================
// ОБНОВЛЕНИЕ СТАТИСТИКИ
// ==========================================
async function updateStats() {
    try {
        // Доступные тесты
        const testsQuery = query(
            collection(window.db, 'tests'),
            where('groupId', '==', currentUser.groupId),
            where('isActive', '==', true)
        );
        const testsSnapshot = await getDocs(testsQuery);
        document.getElementById('testsAvailable').textContent = testsSnapshot.size;

        // Пройденные тесты
        const resultsQuery = query(
            collection(window.db, 'results'),
            where('studentId', '==', currentUser.uid)
        );
        const resultsSnapshot = await getDocs(resultsQuery);
        document.getElementById('testsCompleted').textContent = resultsSnapshot.size;

        // Средний балл
        let totalPercentage = 0;
        resultsSnapshot.forEach(doc => {
            totalPercentage += doc.data().percentage;
        });
        const avgScore = resultsSnapshot.size > 0 ? Math.round(totalPercentage / resultsSnapshot.size) : 0;
        document.getElementById('averageScore').textContent = avgScore + '%';

    } catch (error) {
        console.error('Ошибка загрузки статистики:', error);
    }
}

// ==========================================
// ЗАГРУЗКА ДОСТУПНЫХ ТЕСТОВ
// ==========================================
async function loadAvailableTests() {
    try {
        const testsList = document.getElementById('availableTestsList');

        // Загружаем активные тесты для группы студента
        const q = query(
            collection(window.db, 'tests'),
            where('groupIds', 'array-contains', currentUser.groupId),
            where('isActive', '==', true)
        );
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            testsList.innerHTML = '<div class="empty-state"><p>Нет доступных тестов</p></div>';
            return;
        }

        testsList.innerHTML = '';
        let foundTests = false;

        for (const docSnapshot of snapshot.docs) {
            const test = docSnapshot.data();

            // Проверяем, проходил ли студент этот тест
            const resultsQuery = query(
                collection(window.db, 'results'),
                where('testId', '==', docSnapshot.id),
                where('studentId', '==', currentUser.uid)
            );
            const resultsSnapshot = await getDocs(resultsQuery);
            const alreadyTaken = !resultsSnapshot.empty;

            // ПРОПУСКАЕМ ПРОЙДЕННЫЕ ТЕСТЫ
            if (alreadyTaken) {
                continue;
            }

            foundTests = true;

            // Подсчитываем вопросы
            const questionsSnapshot = await getDocs(collection(window.db, 'tests', docSnapshot.id, 'questions'));
            const questionsCount = questionsSnapshot.size;

            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = `
                <h3>${test.title}</h3>
                <p>${test.description}</p>
                <p>❓ Вопросов: ${questionsCount}</p>
                <p>⏱️ Длительность: ${test.durationMinutes} мин</p>
                <div class="card-actions">
                    <button onclick="startTest('${docSnapshot.id}')" class="btn btn-primary">
                        Начать тест
                    </button>
                </div>
            `;
            testsList.appendChild(card);
        }

        if (!foundTests) {
            testsList.innerHTML = '<div class="empty-state"><p>Все доступные тесты уже пройдены!</p></div>';
        }

    } catch (error) {
        console.error('Ошибка загрузки тестов:', error);
        document.getElementById('availableTestsList').innerHTML = '<p class="error">Ошибка загрузки тестов</p>';
    }
}

// ==========================================
// ЗАГРУЗКА РЕЗУЛЬТАТОВ
// ==========================================
async function loadResults() {
    try {
        const resultsList = document.getElementById('resultsList');
        const q = query(
            collection(window.db, 'results'),
            where('studentId', '==', currentUser.uid),
            orderBy('submittedAt', 'desc')
        );
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            resultsList.innerHTML = '<div class="empty-state"><p>Вы ещё не проходили тесты</p></div>';
            return;
        }

        resultsList.innerHTML = '';

        for (const docSnapshot of snapshot.docs) {
            const result = docSnapshot.data();

            // Получаем название теста
            const testDoc = await getDoc(doc(window.db, 'tests', result.testId));
            const testTitle = testDoc.exists() ? testDoc.data().title : 'Неизвестный тест';

            const card = document.createElement('div');
            card.className = 'card';

            let scoreClass = 'badge-danger';
            if (result.percentage >= 90) scoreClass = 'badge-success';
            else if (result.percentage >= 70) scoreClass = 'badge-warning';

            card.innerHTML = `
                <h3>${testTitle}</h3>
                <p>📊 Результат: ${result.score}/${result.maxScore} <span class="badge ${scoreClass}">${result.percentage}%</span></p>
                <p>⏱️ Время: ${result.timeSpentMinutes} мин</p>
                <p>📅 Дата: ${formatDate(result.submittedAt)}</p>
                <div class="card-actions">
                    <button onclick="viewDetailedResult('${docSnapshot.id}')" class="btn btn-secondary">Подробнее</button>
                </div>
            `;
            resultsList.appendChild(card);
        }
    } catch (error) {
        console.error('Ошибка загрузки результатов:', error);
        document.getElementById('resultsList').innerHTML = '<p class="error">Ошибка загрузки результатов</p>';
    }
}

// ==========================================
// НАЧАТЬ ТЕСТ
// ==========================================
window.startTest = async function (testId) {
    try {
        // Загружаем тест
        const testDoc = await getDoc(doc(window.db, 'tests', testId));
        if (!testDoc.exists()) {
            alert('Тест не найден');
            return;
        }

        currentTest = { id: testId, ...testDoc.data() };

        // Загружаем вопросы (С УЧЁТОМ order)
        const q = query(
            collection(window.db, 'tests', testId, 'questions'),
            orderBy('order')
        );

        const questionsSnapshot = await getDocs(q);
        const questions = [];

        questionsSnapshot.forEach(docSnap => {
            const questionData = docSnap.data();

            // Перемешиваем варианты ответов
            const options = [...questionData.options];
            const correctAnswer = options[questionData.correctAnswerIndex];

            for (let i = options.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [options[i], options[j]] = [options[j], options[i]];
            }

            const newCorrectIndex = options.indexOf(correctAnswer);

            questions.push({
                id: docSnap.id,
                text: questionData.text,
                options: options,
                correctAnswerIndex: newCorrectIndex,
                points: questionData.points ?? 1
            });
        });

        // Перемешиваем вопросы
        for (let i = questions.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [questions[i], questions[j]] = [questions[j], questions[i]];
        }

        // 🔥 ГЛАВНЫЙ ФИКС
        currentQuestions = questions;

        if (currentQuestions.length === 0) {
            alert('В тесте нет вопросов');
            return;
        }

        // Сброс выбранных ответов
        selectedAnswers = {};

        // Показываем тест
        showTestModal();

    } catch (error) {
        console.error('Ошибка загрузки теста:', error);
        alert('Ошибка загрузки теста: ' + error.message);
    }
};


// ==========================================
// ПОКАЗАТЬ МОДАЛКУ ТЕСТА
// ==========================================
function showTestModal() {
    document.getElementById('testModalTitle').textContent = currentTest.title;

    const testContent = document.getElementById('testContent');
    testContent.innerHTML = '';

    currentQuestions.forEach((question, index) => {
        const questionDiv = document.createElement('div');
        questionDiv.className = 'question-item';

        let optionsHtml = '';
        question.options.forEach((option, optionIndex) => {
            optionsHtml += `
                <div class="option" onclick="selectAnswer(${index}, ${optionIndex})">
                    <input type="radio" name="question-${index}" value="${optionIndex}" style="margin-right: 10px;">
                    ${option}
                </div>
            `;
        });

        questionDiv.innerHTML = `
            <h4>Вопрос ${index + 1}</h4>
            <p style="margin-bottom: 15px;">${question.text}</p>
            <div class="options-list" id="options-${index}">
                ${optionsHtml}
            </div>
        `;

        testContent.appendChild(questionDiv);
    });

    document.getElementById('submitTestBtn').style.display = 'block';
    document.getElementById('testModal').classList.add('active');

    // Запускаем таймер
    testStartTime = Date.now();
    startTimer(currentTest.durationMinutes);
}

// ==========================================
// ВЫБОР ОТВЕТА
// ==========================================
window.selectAnswer = function (questionIndex, optionIndex) {
    selectedAnswers[currentQuestions[questionIndex].id] = optionIndex;

    // Визуально выделяем выбранный вариант
    const optionsDiv = document.getElementById(`options-${questionIndex}`);
    const options = optionsDiv.querySelectorAll('.option');

    options.forEach((opt, idx) => {
        if (idx === optionIndex) {
            opt.classList.add('selected');
            opt.querySelector('input').checked = true;
        } else {
            opt.classList.remove('selected');
        }
    });
};

// ==========================================
// ТАЙМЕР
// ==========================================
function startTimer(durationMinutes) {
    const endTime = testStartTime + (durationMinutes * 60 * 1000);

    timerInterval = setInterval(() => {
        const now = Date.now();
        const remaining = endTime - now;

        if (remaining <= 0) {
            clearInterval(timerInterval);
            alert('Время вышло! Тест будет автоматически отправлен.');
            submitTest();
            return;
        }

        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);

        const timerDisplay = document.getElementById('timerDisplay');
        timerDisplay.textContent = `⏱️ ${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;

        // Предупреждение когда осталось меньше 5 минут
        if (remaining < 5 * 60 * 1000) {
            timerDisplay.classList.add('badge-danger');
            timerDisplay.classList.remove('badge-info');
        }
    }, 1000);
}

// ==========================================
// ОТПРАВКА ТЕСТА
// ==========================================
window.submitTest = async function () {
    if (Object.keys(selectedAnswers).length < currentQuestions.length) {
        if (!confirm('Вы ответили не на все вопросы. Отправить тест?')) {
            return;
        }
    }

    clearInterval(timerInterval);

    try {
        // Подсчитываем время
        const timeSpentMinutes = Math.round((Date.now() - testStartTime) / 60000);

        // Подготавливаем ответы для отправки
        const answers = currentQuestions.map(q => ({
            questionId: q.id,
            selectedAnswerIndex: selectedAnswers[q.id] !== undefined ? selectedAnswers[q.id] : -1
        }));

        // Подсчитываем результат
        let score = 0;
        let maxScore = 0;

        const checkedAnswers = currentQuestions.map(q => {
            maxScore += q.points;

            const studentAnswer = selectedAnswers[q.id];
            const isCorrect = studentAnswer !== undefined && studentAnswer === q.correctAnswerIndex;

            if (isCorrect) {
                score += q.points;
            }

            return {
                questionId: q.id,
                selectedAnswerIndex: studentAnswer !== undefined ? studentAnswer : -1,
                isCorrect: isCorrect,
                points: isCorrect ? q.points : 0
            };
        });

        const percentage = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;

        // Сохраняем результат
        await addDoc(collection(window.db, 'results'), {
            testId: currentTest.id,
            studentId: currentUser.uid,
            groupId: currentUser.groupId,
            score: score,
            maxScore: maxScore,
            percentage: percentage,
            answers: checkedAnswers,
            submittedAt: serverTimestamp(),
            timeSpentMinutes: timeSpentMinutes
        });

        // Закрываем модалку теста
        document.getElementById('testModal').classList.remove('active');

        // Показываем результат
        showResultModal(score, maxScore, percentage);

        // Обновляем данные
        await loadResults();
        await loadAvailableTests();
        await updateStats();

    } catch (error) {
        console.error('Ошибка отправки теста:', error);
        alert('Ошибка отправки теста: ' + error.message);
    }
};

// ==========================================
// ПОКАЗАТЬ РЕЗУЛЬТАТ
// ==========================================
function showResultModal(score, maxScore, percentage) {
    const resultContent = document.getElementById('resultContent');

    let message = '';
    let emoji = '';

    if (percentage >= 90) {
        message = 'Отлично! 🎉';
        emoji = '🏆';
    } else if (percentage >= 70) {
        message = 'Хорошо! 👍';
        emoji = '✅';
    } else if (percentage >= 50) {
        message = 'Удовлетворительно';
        emoji = '📝';
    } else {
        message = 'Нужно подучить материал';
        emoji = '📚';
    }

    resultContent.innerHTML = `
        <div style="text-align: center; padding: 40px;">
            <div style="font-size: 80px; margin-bottom: 20px;">${emoji}</div>
            <h2 style="color: #667eea; margin-bottom: 10px;">${message}</h2>
            <h3 style="font-size: 48px; color: #333; margin: 20px 0;">
                ${score}/${maxScore}
            </h3>
            <p style="font-size: 32px; color: #667eea; font-weight: 600;">
                ${percentage}%
            </p>
        </div>
    `;

    document.getElementById('resultModal').classList.add('active');
}

// ==========================================
// ПРОСМОТР ДЕТАЛЬНОГО РЕЗУЛЬТАТА
// ==========================================
window.viewDetailedResult = async function (resultId) {
    try {
        const resultDoc = await getDoc(doc(window.db, 'results', resultId));
        if (!resultDoc.exists()) {
            alert('Результат не найден');
            return;
        }

        const result = resultDoc.data();

        // Получаем вопросы с правильными ответами
        const questionsSnapshot = await getDocs(
            collection(window.db, 'tests', result.testId, 'questions')
        );

        const resultContent = document.getElementById('resultContent');
        resultContent.innerHTML = `
            <h3>Детальный результат</h3>
            <p>📊 Общий результат: ${result.score}/${result.maxScore} (${result.percentage}%)</p>
            <hr style="margin: 20px 0;">
        `;

        questionsSnapshot.forEach(doc => {
            const question = doc.data();
            const studentAnswer = result.answers.find(a => a.questionId === doc.id);

            const questionDiv = document.createElement('div');
            questionDiv.className = 'question-item';

            let optionsHtml = '';
            question.options.forEach((option, idx) => {
                let optionClass = '';
                if (idx === question.correctAnswerIndex) {
                    optionClass = 'correct';
                } else if (studentAnswer && idx === studentAnswer.selectedAnswerIndex) {
                    optionClass = 'incorrect';
                }

                optionsHtml += `<div class="option ${optionClass}">${option}</div>`;
            });

            questionDiv.innerHTML = `
                <h4>${question.text}</h4>
                <p style="margin-bottom: 10px;">
                    <span class="badge ${studentAnswer && studentAnswer.isCorrect ? 'badge-success' : 'badge-danger'}">
                        ${studentAnswer && studentAnswer.isCorrect ? '✓ Правильно' : '✗ Неправильно'}
                    </span>
                </p>
                ${optionsHtml}
            `;

            resultContent.appendChild(questionDiv);
        });

        document.getElementById('resultModal').classList.add('active');

    } catch (error) {
        console.error('Ошибка загрузки детального результата:', error);
        alert('Ошибка загрузки результата');
    }
};

// ==========================================
// ЗАКРЫТЬ МОДАЛКУ
// ==========================================
window.closeModal = function (modalId) {
    document.getElementById(modalId).classList.remove('active');

    if (modalId === 'testModal') {
        clearInterval(timerInterval);
    }
};

// ==========================================
// ВЫХОД
// ==========================================
window.handleLogout = async function () {
    try {
        await signOut(window.auth);
        window.location.href = 'index.html';
    } catch (error) {
        console.error('Ошибка выхода:', error);
        alert('Ошибка выхода: ' + error.message);
    }
};

// ==========================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ==========================================
function formatDate(timestamp) {
    if (!timestamp) return 'Неизвестно';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('ru-RU', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}
