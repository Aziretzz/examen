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
let questionCounter = 0;
let allGroups = [];
let allTests = [];
let currentFilters = {
    group: '',
    course: ''
};
let currentTestResults = [];
let currentResultsFilters = {
    group: '',
    course: ''
};

// ==========================================
// ПРОВЕРКА АВТОРИЗАЦИИ
// ==========================================
onAuthStateChanged(window.auth, async (user) => {
    if (!user) {
        window.location.href = 'index.html';
        return;
    }

    const userDoc = await getDoc(doc(window.db, 'users', user.uid));
    if (!userDoc.exists() || userDoc.data().role !== 'teacher') {
        window.location.href = 'index.html';
        return;
    }

    currentUser = { uid: user.uid, ...userDoc.data() };
    initTeacherDashboard();
});

// ==========================================
// ИНИЦИАЛИЗАЦИЯ DASHBOARD
// ==========================================
async function initTeacherDashboard() {
    document.getElementById('userName').textContent = currentUser.fullName;
    document.getElementById('userEmail').textContent = currentUser.email;

    await loadGroups();
    await loadTests();
    await updateStats();
}

// ==========================================
// ФИЛЬТРАЦИЯ
// ==========================================
window.applyFilters = function () {
    currentFilters.group = document.getElementById('filterGroup').value;
    currentFilters.course = document.getElementById('filterCourse').value;
    displayFilteredTests();
};

window.resetFilters = function () {
    document.getElementById('filterGroup').value = '';
    document.getElementById('filterCourse').value = '';
    currentFilters = { group: '', course: '' };
    displayFilteredTests();
};

async function populateFilterGroups() {
    const filterGroup = document.getElementById('filterGroup');
    filterGroup.innerHTML = '<option value="">Все группы</option>';

    allGroups.forEach(group => {
        const option = document.createElement('option');
        option.value = group.id;
        option.textContent = group.name;
        filterGroup.appendChild(option);
    });
}

async function displayFilteredTests() {
    const testsList = document.getElementById('testsList');

    if (allTests.length === 0) {
        testsList.innerHTML = '<div class="empty-state"><p>У вас пока нет тестов. Создайте первый тест!</p></div>';
        return;
    }

    // Фильтруем тесты
    let filteredTests = allTests;

    // Фильтр по группе
    if (currentFilters.group) {
        filteredTests = filteredTests.filter(test =>
            test.groupIds && test.groupIds.includes(currentFilters.group)
        );
    }

    // Фильтр по курсу
    if (currentFilters.course) {
        const courseNum = parseInt(currentFilters.course);
        // Получаем студентов нужного курса
        const studentsQuery = query(
            collection(window.db, 'users'),
            where('role', '==', 'student'),
            where('course', '==', courseNum)
        );
        const studentsSnapshot = await getDocs(studentsQuery);
        const courseGroupIds = new Set();
        studentsSnapshot.forEach(doc => {
            if (doc.data().groupId) {
                courseGroupIds.add(doc.data().groupId);
            }
        });

        // Фильтруем тесты, у которых хотя бы одна группа содержит студентов этого курса
        filteredTests = filteredTests.filter(test =>
            test.groupIds && test.groupIds.some(gid => courseGroupIds.has(gid))
        );
    }

    // Отображаем
    if (filteredTests.length === 0) {
        testsList.innerHTML = '<div class="empty-state"><p>Нет тестов по выбранным фильтрам</p></div>';
        return;
    }

    testsList.innerHTML = '';
    for (const test of filteredTests) {
        await renderTestCard(test, testsList);
    }
}

// ==========================================
// ОБНОВЛЕНИЕ СТАТИСТИКИ
// ==========================================
async function updateStats() {
    try {
        // Количество групп
        const groupsQuery = query(collection(window.db, 'groups'), where('teacherId', '==', currentUser.uid));
        const groupsSnapshot = await getDocs(groupsQuery);
        document.getElementById('groupsCount').textContent = groupsSnapshot.size;

        // Количество тестов
        const testsQuery = query(collection(window.db, 'tests'), where('teacherId', '==', currentUser.uid));
        const testsSnapshot = await getDocs(testsQuery);
        document.getElementById('testsCount').textContent = testsSnapshot.size;

        // Количество студентов (во всех группах)
        let totalStudents = 0;
        for (const groupDoc of groupsSnapshot.docs) {
            const studentsQuery = query(collection(window.db, 'users'), where('groupId', '==', groupDoc.id));
            const studentsSnapshot = await getDocs(studentsQuery);
            totalStudents += studentsSnapshot.size;
        }
        document.getElementById('studentsCount').textContent = totalStudents;

    } catch (error) {
        console.error('Ошибка загрузки статистики:', error);
    }
}

// ==========================================
// ЗАГРУЗКА ГРУПП
// ==========================================
async function loadGroups() {
    try {
        const groupsList = document.getElementById('groupsList');
        const q = query(collection(window.db, 'groups'), where('teacherId', '==', currentUser.uid), orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);

        allGroups = [];

        if (snapshot.empty) {
            groupsList.innerHTML = '<div class="empty-state"><p>У вас пока нет групп. Создайте первую группу!</p></div>';
            return;
        }

        groupsList.innerHTML = '';

        for (const docSnapshot of snapshot.docs) {
            const group = docSnapshot.data();
            allGroups.push({ id: docSnapshot.id, name: group.name, ...group });

            // Подсчитываем студентов в группе
            const studentsQuery = query(collection(window.db, 'users'), where('groupId', '==', docSnapshot.id));
            const studentsSnapshot = await getDocs(studentsQuery);
            const studentsCount = studentsSnapshot.size;

            const card = document.createElement('div');
            card.className = 'card';
            card.innerHTML = `
                <h3>${group.name}</h3>
                <p>👨‍🎓 Студентов: ${studentsCount}</p>
                <p>📅 Создана: ${formatDate(group.createdAt)}</p>
                <div class="card-actions">
                    <button onclick="viewGroupStudents('${docSnapshot.id}', '${group.name}')" class="btn btn-secondary">Студенты</button>
                    <button onclick="showEditGroupModal('${docSnapshot.id}', '${group.name}')" class="btn btn-primary">Редактировать</button>
                    <button onclick="deleteGroup('${docSnapshot.id}')" class="btn btn-danger">Удалить</button>
                </div>
            `;
            groupsList.appendChild(card);
        }
    } catch (error) {
        console.error('Ошибка загрузки групп:', error);
        document.getElementById('groupsList').innerHTML = '<p class="error">Ошибка загрузки групп</p>';
    }
}

// ==========================================
// ЗАГРУЗКА ТЕСТОВ
// ==========================================
async function loadTests() {
    try {
        const testsList = document.getElementById('testsList');
        const q = query(collection(window.db, 'tests'), where('teacherId', '==', currentUser.uid), orderBy('createdAt', 'desc'));
        const snapshot = await getDocs(q);

        allTests = [];

        if (snapshot.empty) {
            testsList.innerHTML = '<div class="empty-state"><p>У вас пока нет тестов. Создайте первый тест!</p></div>';
            return;
        }

        testsList.innerHTML = '';

        for (const docSnapshot of snapshot.docs) {
            const test = docSnapshot.data();
            await renderTestCard({ id: docSnapshot.id, ...test }, testsList);
        }

    } catch (error) {
        console.error('Ошибка загрузки тестов:', error);
        document.getElementById('testsList').innerHTML = '<p class="error">Ошибка загрузки тестов</p>';
    }
}

async function renderTestCard(test, container) {
    // Получаем названия групп
    let groupNames = [];
    if (test.groupIds && Array.isArray(test.groupIds)) {
        for (const gid of test.groupIds) {
            const groupDoc = await getDoc(doc(window.db, 'groups', gid));
            if (groupDoc.exists()) {
                groupNames.push(groupDoc.data().name);
            }
        }
    } else if (test.groupId) {
        // Поддержка старого формата (одна группа)
        const groupDoc = await getDoc(doc(window.db, 'groups', test.groupId));
        if (groupDoc.exists()) {
            groupNames.push(groupDoc.data().name);
        }
    }

    const groupNamesStr = groupNames.length > 0 ? groupNames.join(', ') : 'Неизвестные группы';

    // Подсчитываем результаты
    const resultsQuery = query(collection(window.db, 'results'), where('testId', '==', test.id));
    const resultsSnapshot = await getDocs(resultsQuery);
    const resultsCount = resultsSnapshot.size;

    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
        <h3>${test.title}</h3>
        <p>${test.description}</p>
        <p>📚 Группы: ${groupNamesStr}</p>
        <p>⏱️ Длительность: ${test.durationMinutes} мин</p>
        <p>📊 Результатов: ${resultsCount}</p>
        <p>
            <span class="badge ${test.isActive ? 'badge-success' : 'badge-danger'}">
                ${test.isActive ? 'Активен' : 'Неактивен'}
            </span>
        </p>
        <div class="card-actions">
            <button onclick="toggleTestActive('${test.id}', ${!test.isActive})" class="btn ${test.isActive ? 'btn-danger' : 'btn-success'}">
                ${test.isActive ? 'Деактивировать' : 'Активировать'}
            </button>
            <button onclick="viewTestResults('${test.id}', '${test.title}')" class="btn btn-secondary">Результаты</button>
            <button onclick="showEditTestModal('${test.id}')" class="btn btn-primary">Редактировать</button>
            <button onclick="deleteTest('${test.id}')" class="btn btn-danger">Удалить</button>
        </div>
    `;
    container.appendChild(card);
}

// ==========================================
// МОДАЛКИ
// ==========================================
window.showCreateGroupModal = function () {
    document.getElementById('createGroupModal').classList.add('active');
};

window.showCreateTestModal = async function () {
    // Загружаем группы как чекбоксы
    const testGroups = document.getElementById('testGroups');
    testGroups.innerHTML = '';

    if (allGroups.length === 0) {
        testGroups.innerHTML = '<p style="color: #999;">У вас пока нет групп. Создайте группу сначала.</p>';
    } else {
        allGroups.forEach(group => {
            const checkbox = document.createElement('div');
            checkbox.style.padding = '10px';
            checkbox.style.borderBottom = '1px solid #e0e0e0';
            checkbox.innerHTML = `
                <label style="display: flex; align-items: center; cursor: pointer;">
                    <input type="checkbox" name="testGroups" value="${group.id}" style="margin-right: 10px; width: 18px; height: 18px; cursor: pointer;">
                    <span>${group.name}</span>
                </label>
            `;
            testGroups.appendChild(checkbox);
        });
    }

    // Очищаем список вопросов
    document.getElementById('questionsList').innerHTML = '';
    questionCounter = 0;

    // Добавляем первый вопрос
    addQuestion();

    document.getElementById('createTestModal').classList.add('active');
};

window.closeModal = function (modalId) {
    document.getElementById(modalId).classList.remove('active');
};

// ==========================================
// СОЗДАНИЕ ГРУППЫ
// ==========================================
window.createGroup = async function (event) {
    event.preventDefault();

    const name = document.getElementById('groupName').value;

    try {
        await addDoc(collection(window.db, 'groups'), {
            name: name,
            teacherId: currentUser.uid,
            createdAt: serverTimestamp()
        });

        alert('Группа создана успешно!');
        closeModal('createGroupModal');
        document.getElementById('groupName').value = '';
        await loadGroups();
        await updateStats();

    } catch (error) {
        console.error('Ошибка создания группы:', error);
        alert('Ошибка создания группы: ' + error.message);
    }
};

// ==========================================
// ДОБАВЛЕНИЕ ВОПРОСА
// ==========================================
window.addQuestion = function () {
    questionCounter++;
    const questionsList = document.getElementById('questionsList');

    const questionDiv = document.createElement('div');
    questionDiv.className = 'question-item';
    questionDiv.id = `question-${questionCounter}`;
    questionDiv.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <h4>Вопрос ${questionCounter}</h4>
            <button type="button" onclick="removeQuestion(${questionCounter})" class="btn btn-danger" style="width: auto; padding: 5px 15px;">Удалить</button>
        </div>
        <div class="form-group">
            <label>Текст вопроса</label>
            <input type="text" class="question-text" required placeholder="Решите уравнение: x² - 5x + 6 = 0">
        </div>
        <div class="form-group">
            <label>Баллы за правильный ответ</label>
            <input type="number" class="question-points" required min="1" value="10">
        </div>
        <div class="form-group">
            <label>Варианты ответов</label>
            <input type="text" class="option-input" required placeholder="Вариант 1">
            <input type="text" class="option-input" required placeholder="Вариант 2">
            <input type="text" class="option-input" required placeholder="Вариант 3">
            <input type="text" class="option-input" required placeholder="Вариант 4">
        </div>
        <div class="form-group">
            <label>Правильный ответ (номер варианта 1-4)</label>
            <input type="number" class="correct-answer" required min="1" max="4" value="1">
        </div>
    `;

    questionsList.appendChild(questionDiv);
};

window.removeQuestion = function (id) {
    const questionDiv = document.getElementById(`question-${id}`);
    if (questionDiv) {
        questionDiv.remove();
    }
};

// ==========================================
// СОЗДАНИЕ ТЕСТА
// ==========================================
window.createTest = async function (event) {
    event.preventDefault();

    const title = document.getElementById('testTitle').value;
    const description = document.getElementById('testDescription').value;
    const duration = parseInt(document.getElementById('testDuration').value);

    // Получаем выбранные группы
    const selectedCheckboxes = document.querySelectorAll('input[name="testGroups"]:checked');
    const groupIds = Array.from(selectedCheckboxes).map(cb => cb.value);

    if (groupIds.length === 0) {
        alert('Выберите хотя бы одну группу');
        return;
    }

    // Собираем вопросы
    const questionDivs = document.querySelectorAll('.question-item');
    if (questionDivs.length === 0) {
        alert('Добавьте хотя бы один вопрос');
        return;
    }

    const questions = [];
    questionDivs.forEach((div, index) => {
        const text = div.querySelector('.question-text').value;
        const points = parseInt(div.querySelector('.question-points').value);
        const optionInputs = div.querySelectorAll('.option-input');
        const options = Array.from(optionInputs).map(input => input.value);
        const correctAnswer = parseInt(div.querySelector('.correct-answer').value) - 1; // -1 потому что массив с 0

        questions.push({
            text: text,
            options: options,
            correctAnswerIndex: correctAnswer,
            points: points,
            order: index + 1
        });
    });

    try {
        // Создаём тест
        const testRef = await addDoc(collection(window.db, 'tests'), {
            title: title,
            description: description,
            teacherId: currentUser.uid,
            groupIds: groupIds, // Массив ID групп
            durationMinutes: duration,
            isActive: false,
            createdAt: serverTimestamp()
        });

        // Добавляем вопросы
        for (const question of questions) {
            await addDoc(collection(window.db, 'tests', testRef.id, 'questions'), question);
        }

        alert('Тест создан успешно!');
        closeModal('createTestModal');
        await loadTests();
        await updateStats();

    } catch (error) {
        console.error('Ошибка создания теста:', error);
        alert('Ошибка создания теста: ' + error.message);
    }
};

// ==========================================
// АКТИВАЦИЯ/ДЕАКТИВАЦИЯ ТЕСТА
// ==========================================
window.toggleTestActive = async function (testId, isActive) {
    try {
        await updateDoc(doc(window.db, 'tests', testId), {
            isActive: isActive
        });

        alert(isActive ? 'Тест активирован!' : 'Тест деактивирован!');
        await loadTests();

    } catch (error) {
        console.error('Ошибка изменения статуса теста:', error);
        alert('Ошибка: ' + error.message);
    }
};

// ==========================================
// ПРОСМОТР РЕЗУЛЬТАТОВ
// ==========================================
window.viewTestResults = async function (testId, testTitle) {
    try {
        const resultsContent = document.getElementById('resultsContent');
        resultsContent.innerHTML = '<p class="loading">Загрузка результатов...</p>';

        document.getElementById('resultsModalTitle').textContent = `Результаты: ${testTitle}`;
        document.getElementById('resultsModal').classList.add('active');

        // Загружаем ВСЕ результаты
        const q = query(collection(window.db, 'results'), where('testId', '==', testId), orderBy('score', 'desc'));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            resultsContent.innerHTML = '<div class="empty-state"><p>Пока нет результатов</p></div>';
            return;
        }

        // Сохраняем все результаты глобально
        currentTestResults = [];

        for (const resultDoc of snapshot.docs) {
            const result = resultDoc.data();

            // Получаем данные студента
            const studentDoc = await getDoc(doc(window.db, 'users', result.studentId));
            const student = studentDoc.exists() ? studentDoc.data() : null;

            // Получаем данные группы
            let groupName = 'Неизвестная группа';
            if (result.groupId) {
                const groupDoc = await getDoc(doc(window.db, 'groups', result.groupId));
                groupName = groupDoc.exists() ? groupDoc.data().name : 'Неизвестная группа';
            }

            currentTestResults.push({
                id: resultDoc.id,
                ...result,
                studentName: student ? student.fullName : 'Неизвестный студент',
                studentCourse: student ? student.course : null,
                groupName: groupName
            });
        }

        // Заполняем фильтр групп
        const filterGroupSelect = document.getElementById('resultsFilterGroup');
        filterGroupSelect.innerHTML = '<option value="">Все группы</option>';

        const uniqueGroups = [...new Set(currentTestResults.map(r => r.groupId))];
        for (const groupId of uniqueGroups) {
            if (groupId) {
                const groupDoc = await getDoc(doc(window.db, 'groups', groupId));
                if (groupDoc.exists()) {
                    const option = document.createElement('option');
                    option.value = groupId;
                    option.textContent = groupDoc.data().name;
                    filterGroupSelect.appendChild(option);
                }
            }
        }

        // Сбрасываем фильтры
        currentResultsFilters = { group: '', course: '' };
        document.getElementById('resultsFilterGroup').value = '';
        document.getElementById('resultsFilterCourse').value = '';

        // Отображаем результаты
        displayFilteredResults();

    } catch (error) {
        console.error('Ошибка загрузки результатов:', error);
        document.getElementById('resultsContent').innerHTML = '<p class="error">Ошибка загрузки результатов</p>';
    }
};


// ==========================================
// ФИЛЬТРАЦИЯ РЕЗУЛЬТАТОВ
// ==========================================
window.filterResults = function () {
    currentResultsFilters.group = document.getElementById('resultsFilterGroup').value;
    currentResultsFilters.course = document.getElementById('resultsFilterCourse').value;
    displayFilteredResults();
};

window.resetResultsFilters = function () {
    document.getElementById('resultsFilterGroup').value = '';
    document.getElementById('resultsFilterCourse').value = '';
    currentResultsFilters = { group: '', course: '' };
    displayFilteredResults();
};

function displayFilteredResults() {
    const resultsContent = document.getElementById('resultsContent');

    // Фильтруем результаты
    let filtered = currentTestResults;

    if (currentResultsFilters.group) {
        filtered = filtered.filter(r => r.groupId === currentResultsFilters.group);
    }

    if (currentResultsFilters.course) {
        const courseNum = parseInt(currentResultsFilters.course);
        filtered = filtered.filter(r => r.studentCourse === courseNum);
    }

    if (filtered.length === 0) {
        resultsContent.innerHTML = '<div class="empty-state"><p>Нет результатов по выбранным фильтрам</p></div>';
        return;
    }

    let html = '';
    filtered.forEach(result => {
        html += `
            <div class="card">
                <h4>${result.studentName}</h4>
                <p>📚 Группа: ${result.groupName}</p>
                ${result.studentCourse ? `<p>🎓 Курс: ${result.studentCourse}</p>` : ''}
                <p>📊 Результат: ${result.score}/${result.maxScore} (${result.percentage}%)</p>
                <p>⏱️ Время: ${result.timeSpentMinutes} мин</p>
                <p>📅 Дата: ${formatDate(result.submittedAt)}</p>
            </div>
        `;
    });

    resultsContent.innerHTML = html;
}

// ==========================================
// УДАЛЕНИЕ ГРУППЫ
// ==========================================
window.deleteGroup = async function (groupId) {
    if (!confirm('Вы уверены? Это удалит группу, но студенты останутся в системе.')) {
        return;
    }

    try {
        await deleteDoc(doc(window.db, 'groups', groupId));
        alert('Группа удалена!');
        await loadGroups();
        await updateStats();
    } catch (error) {
        console.error('Ошибка удаления группы:', error);
        alert('Ошибка удаления: ' + error.message);
    }
};

// ==========================================
// УДАЛЕНИЕ ТЕСТА
// ==========================================
window.deleteTest = async function (testId) {
    if (!confirm('Вы уверены? Это также удалит все вопросы и результаты теста.')) {
        return;
    }

    try {
        // Удаляем вопросы
        const questionsSnapshot = await getDocs(collection(window.db, 'tests', testId, 'questions'));
        for (const questionDoc of questionsSnapshot.docs) {
            await deleteDoc(questionDoc.ref);
        }

        // Удаляем результаты
        const resultsQuery = query(collection(window.db, 'results'), where('testId', '==', testId));
        const resultsSnapshot = await getDocs(resultsQuery);
        for (const resultDoc of resultsSnapshot.docs) {
            await deleteDoc(resultDoc.ref);
        }

        // Удаляем сам тест
        await deleteDoc(doc(window.db, 'tests', testId));

        alert('Тест удалён!');
        await loadTests();
        await updateStats();

    } catch (error) {
        console.error('Ошибка удаления теста:', error);
        alert('Ошибка удаления: ' + error.message);
    }
};

// ==========================================
// ПРОСМОТР СТУДЕНТОВ ГРУППЫ
// ==========================================
window.viewGroupStudents = async function (groupId, groupName) {
    try {
        const q = query(collection(window.db, 'users'), where('groupId', '==', groupId));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            alert('В этой группе пока нет студентов');
            return;
        }

        let message = `Студенты группы "${groupName}":\n\n`;
        snapshot.forEach(doc => {
            const student = doc.data();
            message += `- ${student.fullName} (${student.email})\n`;
        });

        alert(message);
    } catch (error) {
        console.error('Ошибка загрузки студентов:', error);
        alert('Ошибка загрузки студентов');
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
// РЕДАКТИРОВАНИЕ ГРУППЫ
// ==========================================
window.showEditGroupModal = function (groupId, groupName) {
    document.getElementById('editGroupId').value = groupId;
    document.getElementById('editGroupName').value = groupName;
    document.getElementById('editGroupModal').classList.add('active');
};

window.updateGroup = async function (event) {
    event.preventDefault();

    const groupId = document.getElementById('editGroupId').value;
    const newName = document.getElementById('editGroupName').value;

    try {
        await updateDoc(doc(window.db, 'groups', groupId), {
            name: newName
        });

        alert('Группа обновлена!');
        closeModal('editGroupModal');
        await loadGroups();

    } catch (error) {
        console.error('Ошибка обновления группы:', error);
        alert('Ошибка: ' + error.message);
    }
};

// ==========================================
// РЕДАКТИРОВАНИЕ ТЕСТА
// ==========================================
let editQuestionCounter = 0;
let editQuestionsData = [];

window.showEditTestModal = async function (testId) {
    try {
        const testDoc = await getDoc(doc(window.db, 'tests', testId));
        if (!testDoc.exists()) {
            alert('Тест не найден');
            return;
        }

        const test = testDoc.data();
        document.getElementById('editTestId').value = testId;
        document.getElementById('editTestTitle').value = test.title;
        document.getElementById('editTestDescription').value = test.description;
        document.getElementById('editTestDuration').value = test.durationMinutes;

        // Загружаем вопросы
        const questionsSnapshot = await getDocs(collection(window.db, 'tests', testId, 'questions'));
        editQuestionsData = [];
        editQuestionCounter = 0;

        const questionsList = document.getElementById('editQuestionsList');
        questionsList.innerHTML = '';

        if (questionsSnapshot.empty) {
            questionsList.innerHTML = '<p style="color: #999; text-align: center; padding: 20px;">Нет вопросов. Добавьте первый вопрос!</p>';
        } else {
            questionsSnapshot.forEach(doc => {
                const question = doc.data();
                editQuestionsData.push({
                    id: doc.id,
                    ...question
                });
                renderEditQuestion(doc.id, question);
            });
        }

        document.getElementById('editTestModal').classList.add('active');
    } catch (error) {
        console.error('Ошибка загрузки теста:', error);
        alert('Ошибка загрузки теста');
    }
};

function renderEditQuestion(questionId, questionData) {
    editQuestionCounter++;
    const questionsList = document.getElementById('editQuestionsList');

    const questionDiv = document.createElement('div');
    questionDiv.className = 'question-item';
    questionDiv.id = `edit-question-${editQuestionCounter}`;
    questionDiv.dataset.questionId = questionId; // Храним ID вопроса

    questionDiv.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <h4>Вопрос ${editQuestionCounter}</h4>
            <button type="button" onclick="removeEditQuestion(${editQuestionCounter})" class="btn btn-danger" style="width: auto; padding: 5px 15px;">Удалить</button>
        </div>
        <div class="form-group">
            <label>Текст вопроса</label>
            <input type="text" class="edit-question-text" required value="${questionData.text || ''}" placeholder="Решите уравнение: x² - 5x + 6 = 0">
        </div>
        <div class="form-group">
            <label>Баллы за правильный ответ</label>
            <input type="number" class="edit-question-points" required min="1" value="${questionData.points || 10}">
        </div>
        <div class="form-group">
            <label>Варианты ответов</label>
            <input type="text" class="edit-option-input" required value="${questionData.options[0] || ''}" placeholder="Вариант 1">
            <input type="text" class="edit-option-input" required value="${questionData.options[1] || ''}" placeholder="Вариант 2">
            <input type="text" class="edit-option-input" required value="${questionData.options[2] || ''}" placeholder="Вариант 3">
            <input type="text" class="edit-option-input" required value="${questionData.options[3] || ''}" placeholder="Вариант 4">
        </div>
        <div class="form-group">
            <label>Правильный ответ (номер варианта 1-4)</label>
            <input type="number" class="edit-correct-answer" required min="1" max="4" value="${(questionData.correctAnswerIndex || 0) + 1}">
        </div>
    `;

    questionsList.appendChild(questionDiv);
}

window.addEditQuestion = function () {
    editQuestionCounter++;
    const questionsList = document.getElementById('editQuestionsList');

    // Если это первый вопрос, убираем сообщение "Нет вопросов"
    if (questionsList.querySelector('p')) {
        questionsList.innerHTML = '';
    }

    const questionDiv = document.createElement('div');
    questionDiv.className = 'question-item';
    questionDiv.id = `edit-question-${editQuestionCounter}`;
    questionDiv.dataset.questionId = 'new'; // Отмечаем как новый

    questionDiv.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <h4>Вопрос ${editQuestionCounter} <span style="color: #4CAF50; font-size: 14px;">(новый)</span></h4>
            <button type="button" onclick="removeEditQuestion(${editQuestionCounter})" class="btn btn-danger" style="width: auto; padding: 5px 15px;">Удалить</button>
        </div>
        <div class="form-group">
            <label>Текст вопроса</label>
            <input type="text" class="edit-question-text" required placeholder="Решите уравнение: x² - 5x + 6 = 0">
        </div>
        <div class="form-group">
            <label>Баллы за правильный ответ</label>
            <input type="number" class="edit-question-points" required min="1" value="10">
        </div>
        <div class="form-group">
            <label>Варианты ответов</label>
            <input type="text" class="edit-option-input" required placeholder="Вариант 1">
            <input type="text" class="edit-option-input" required placeholder="Вариант 2">
            <input type="text" class="edit-option-input" required placeholder="Вариант 3">
            <input type="text" class="edit-option-input" required placeholder="Вариант 4">
        </div>
        <div class="form-group">
            <label>Правильный ответ (номер варианта 1-4)</label>
            <input type="number" class="edit-correct-answer" required min="1" max="4" value="1">
        </div>
    `;

    questionsList.appendChild(questionDiv);
};

window.removeEditQuestion = function (id) {
    const questionDiv = document.getElementById(`edit-question-${id}`);
    if (questionDiv) {
        questionDiv.remove();
    }

    // Если больше нет вопросов, показываем сообщение
    const questionsList = document.getElementById('editQuestionsList');
    if (questionsList.children.length === 0) {
        questionsList.innerHTML = '<p style="color: #999; text-align: center; padding: 20px;">Нет вопросов. Добавьте первый вопрос!</p>';
    }
};

window.updateTest = async function (event) {
    event.preventDefault();

    const testId = document.getElementById('editTestId').value;
    const newTitle = document.getElementById('editTestTitle').value;
    const newDescription = document.getElementById('editTestDescription').value;
    const newDuration = parseInt(document.getElementById('editTestDuration').value);

    try {
        // Обновляем основную информацию теста
        await updateDoc(doc(window.db, 'tests', testId), {
            title: newTitle,
            description: newDescription,
            durationMinutes: newDuration
        });

        // Собираем все вопросы из формы
        const questionDivs = document.querySelectorAll('#editQuestionsList .question-item');

        if (questionDivs.length === 0) {
            alert('Добавьте хотя бы один вопрос');
            return;
        }

        // Удаляем ВСЕ старые вопросы
        const oldQuestionsSnapshot = await getDocs(collection(window.db, 'tests', testId, 'questions'));
        for (const oldDoc of oldQuestionsSnapshot.docs) {
            await deleteDoc(oldDoc.ref);
        }

        // Добавляем все вопросы заново
        for (let index = 0; index < questionDivs.length; index++) {
            const div = questionDivs[index];

            const text = div.querySelector('.edit-question-text').value;
            const points = parseInt(div.querySelector('.edit-question-points').value);
            const optionInputs = div.querySelectorAll('.edit-option-input');
            const options = Array.from(optionInputs).map(input => input.value);
            const correctAnswer = parseInt(div.querySelector('.edit-correct-answer').value) - 1;

            await addDoc(collection(window.db, 'tests', testId, 'questions'), {
                text: text,
                options: options,
                correctAnswerIndex: correctAnswer,
                points: points,
                order: index + 1
            });
        }

        alert('Тест обновлён!');
        closeModal('editTestModal');
        await loadTests();

    } catch (error) {
        console.error('Ошибка обновления теста:', error);
        alert('Ошибка: ' + error.message);
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