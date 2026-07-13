import { isFirebaseConfigured, getFirebaseConfig, saveFirebaseConfig, resetFirebaseConfig } from './config.js';

// ==========================================================================
// DOM Element Selectors
// ==========================================================================
const views = {
  landing: document.getElementById('landing-view'),
  auth: document.getElementById('auth-view'),
  todo: document.getElementById('todo-view'),
  configModal: document.getElementById('config-modal')
};

// Buttons
const btnStart = document.getElementById('btn-start');
const btnLogout = document.getElementById('btn-logout');
const btnGuestLogin = document.getElementById('btn-guest-login');
const btnBackLanding = document.getElementById('btn-back-landing');
const btnResetConfig = document.getElementById('btn-reset-config');
const btnAuthSubmit = document.getElementById('btn-auth-submit');

// Auth Form elements
const authForm = document.getElementById('auth-form');
const authEmail = document.getElementById('auth-email');
const authPassword = document.getElementById('auth-password');
const tabLogin = document.getElementById('tab-login');
const tabSignup = document.getElementById('tab-signup');
const authSubmitText = document.getElementById('auth-submit-text');

// Todo elements
const todoForm = document.getElementById('todo-form');
const todoInput = document.getElementById('todo-input');
const todoList = document.getElementById('todo-list');
const todoEmptyState = document.getElementById('todo-empty-state');
const filterTabs = document.querySelectorAll('.filter-tab');

// User profile elements
const userDisplayName = document.getElementById('user-display-name');
const userAvatarText = document.getElementById('user-avatar-text');
const userStatusBadge = document.getElementById('user-status-badge');

// Progress stats elements
const progressBarFill = document.getElementById('progress-bar-fill');
const progressPercentageText = document.getElementById('progress-percentage-text');
const progressCountText = document.getElementById('progress-count-text');

// Config Form elements
const configForm = document.getElementById('config-form');
const configPaste = document.getElementById('config-paste');

// ==========================================================================
// State Variables
// ==========================================================================
let auth = null;
let database = null;
let dbRef = null;
let tasksRef = null;

let isMockMode = false;
let currentUser = null;
let currentFilter = 'all'; // 'all', 'active', 'completed'
let tasksList = []; // Local cache of tasks: Array of { id, text, completed, createdAt }

// ==========================================================================
// Toast Notification Helper
// ==========================================================================
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let iconName = 'info';
  if (type === 'success') iconName = 'check-circle';
  if (type === 'error') iconName = 'alert-triangle';
  
  toast.innerHTML = `
    <i data-lucide="${iconName}" class="toast-icon"></i>
    <span class="toast-message">${message}</span>
  `;
  
  container.appendChild(toast);
  lucide.createIcons(); // render toast icon
  
  // Slide out and remove
  setTimeout(() => {
    toast.style.animation = 'toast-out 0.4s ease forwards';
    toast.addEventListener('animationend', () => {
      toast.remove();
    });
  }, 4000);
}

// Visual error feedback (shake animation)
function shakeCard(viewElement) {
  const card = viewElement.querySelector('.glass-card');
  if (card) {
    card.classList.add('shake');
    card.addEventListener('animationend', () => {
      card.classList.remove('shake');
    }, { once: true });
  }
}

// ==========================================================================
// View Routing System
// ==========================================================================
function switchView(viewName) {
  Object.keys(views).forEach(key => {
    if (key === 'configModal') return; // Handles modal overlay separately
    
    if (key === viewName) {
      views[key].style.display = 'flex';
      // Force repaint to allow transition
      void views[key].offsetWidth;
      views[key].classList.add('active');
    } else {
      views[key].classList.remove('active');
      views[key].style.display = 'none';
    }
  });
}

// ==========================================================================
// Main Initialization & Dual Mode Handler (Firebase vs LocalStorage)
// ==========================================================================
async function startApp() {
  if (!isFirebaseConfigured()) {
    // Enable Mock Mode (LocalStorage)
    isMockMode = true;
    console.log('Firebase is not configured. Starting in LocalStorage Mock Mode.');
    
    // Check if user session already exists in sessionStorage
    const savedUser = sessionStorage.getItem('cloud_tasks_current_user');
    if (savedUser) {
      currentUser = JSON.parse(savedUser);
      updateUserUI(currentUser);
      setupMockDatabaseSync(currentUser);
      switchView('todo');
      showToast('歡迎回來！您正處於【本地儲存模式】。', 'success');
    } else {
      switchView('landing');
      setTimeout(() => {
        showToast('偵測到尚未設定 Firebase，已自動切換為【本地測試模式】！可點擊右下角設定 ⚙️ 來串接資料庫。', 'info');
      }, 800);
    }
    return;
  }
  
  try {
    isMockMode = false;
    const config = getFirebaseConfig();
    
    // Dynamic import of Firebase bundles to avoid errors before configurations
    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
    const { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signInAnonymously, signOut, onAuthStateChanged } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');
    const { getDatabase, ref, set, push, onValue, off, update, remove } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js');
    
    // Initialize Firebase
    const app = initializeApp(config);
    auth = getAuth(app);
    database = getDatabase(app);
    
    // Setup authentication listener
    onAuthStateChanged(auth, (user) => {
      if (user) {
        currentUser = user;
        setupDatabaseSync(user);
        updateUserUI(user);
        switchView('todo');
        showToast(`歡迎回來，${user.isAnonymous ? '訪客' : (user.email.split('@')[0])}！`, 'success');
      } else {
        currentUser = null;
        cleanupDatabaseSync();
        switchView('landing');
      }
    });

    // Save helper actions globally for our event functions
    window.fbActions = {
      ref, set, push, onValue, off, update, remove, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword, signInAnonymously
    };
    
  } catch (error) {
    console.error('Firebase initialization failed:', error);
    showToast('連線至 Firebase 失敗，已自動降級為【本地測試模式】！', 'error');
    isMockMode = true;
    switchView('landing');
  }
}

// Reset configuration and reload
btnResetConfig.addEventListener('click', () => {
  if (isMockMode) {
    // If we are in mock mode, clicking the settings button opens the setup modal directly
    views.configModal.classList.add('active');
  } else {
    if (confirm('確定要清除目前的 Firebase 連線設定並重新設定嗎？')) {
      resetFirebaseConfig();
      window.location.reload();
    }
  }
});

// Save Firebase Config
configForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const configText = configPaste.value.trim();
  const success = saveFirebaseConfig(configText);
  
  if (success) {
    views.configModal.classList.remove('active');
    showToast('Firebase 設定儲存成功！正在連線...', 'success');
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  } else {
    shakeCard(views.configModal);
    showToast('無效的 Firebase 設定格式，請確認是否包含 apiKey、projectId 和 databaseURL！', 'error');
  }
});

// Close modal if click outside the card
views.configModal.addEventListener('click', (e) => {
  if (e.target === views.configModal) {
    views.configModal.classList.remove('active');
  }
});

// ==========================================================================
// Authentication Event Handlers
// ==========================================================================

// Landing Page button
btnStart.addEventListener('click', () => {
  if (currentUser) {
    switchView('todo');
  } else {
    switchView('auth');
  }
});

// Back from Auth to Landing
btnBackLanding.addEventListener('click', () => {
  switchView('landing');
});

// Authentication state toggle (Login / Signup)
let authMode = 'login'; // 'login' or 'signup'

tabLogin.addEventListener('click', () => {
  authMode = 'login';
  tabLogin.classList.add('active');
  tabSignup.classList.remove('active');
  authSubmitText.textContent = '登入';
  authForm.reset();
});

tabSignup.addEventListener('click', () => {
  authMode = 'signup';
  tabSignup.classList.add('active');
  tabLogin.classList.remove('active');
  authSubmitText.textContent = '註冊';
  authForm.reset();
});

// Submit Email/Password Authentication (Hybrid Mode)
authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const email = authEmail.value.trim();
  const password = authPassword.value;
  
  if (password.length < 6) {
    showToast('密碼長度至少需要 6 個字元！', 'error');
    shakeCard(views.auth);
    return;
  }
  
  btnAuthSubmit.disabled = true;
  const originalText = authSubmitText.textContent;
  authSubmitText.textContent = authMode === 'login' ? '登入中...' : '註冊中...';
  
  if (isMockMode) {
    // -------------------------------------------------------------
    // Mock Authentication Logic (LocalStorage)
    // -------------------------------------------------------------
    setTimeout(() => {
      let mockUsers = JSON.parse(localStorage.getItem('cloud_tasks_mock_users') || '[]');
      
      if (authMode === 'login') {
        const found = mockUsers.find(u => u.email === email && u.password === password);
        if (found) {
          currentUser = { uid: 'mock-' + email.replace(/[^a-zA-Z0-9]/g, ''), email: email, isAnonymous: false };
          sessionStorage.setItem('cloud_tasks_current_user', JSON.stringify(currentUser));
          updateUserUI(currentUser);
          setupMockDatabaseSync(currentUser);
          switchView('todo');
          showToast(`歡迎回來，${email.split('@')[0]}！（本地模式）`, 'success');
        } else {
          showToast('帳號或密碼錯誤！（本地模式）', 'error');
          shakeCard(views.auth);
        }
      } else {
        const exists = mockUsers.some(u => u.email === email);
        if (exists) {
          showToast('此電子信箱已被註冊！（本地模式）', 'error');
          shakeCard(views.auth);
        } else {
          mockUsers.push({ email, password });
          localStorage.setItem('cloud_tasks_mock_users', JSON.stringify(mockUsers));
          
          currentUser = { uid: 'mock-' + email.replace(/[^a-zA-Z0-9]/g, ''), email: email, isAnonymous: false };
          sessionStorage.setItem('cloud_tasks_current_user', JSON.stringify(currentUser));
          updateUserUI(currentUser);
          setupMockDatabaseSync(currentUser);
          switchView('todo');
          showToast('註冊成功並已自動登入！（本地模式）', 'success');
        }
      }
      btnAuthSubmit.disabled = false;
      authSubmitText.textContent = originalText;
    }, 600);
    
  } else {
    // -------------------------------------------------------------
    // Real Firebase Authentication
    // -------------------------------------------------------------
    if (!window.fbActions) {
      showToast('Firebase 尚未初始化完成，請稍候。', 'error');
      btnAuthSubmit.disabled = false;
      authSubmitText.textContent = originalText;
      return;
    }
    
    try {
      if (authMode === 'login') {
        await window.fbActions.signInWithEmailAndPassword(auth, email, password);
      } else {
        await window.fbActions.createUserWithEmailAndPassword(auth, email, password);
        showToast('註冊成功並已自動登入！', 'success');
      }
    } catch (error) {
      console.error('Auth action failed:', error);
      let errorMsg = '身份驗證失敗，請檢查輸入內容！';
      if (error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
        errorMsg = '電子信箱或密碼錯誤！';
      } else if (error.code === 'auth/email-already-in-use') {
        errorMsg = '此電子信箱已被註冊！';
      } else if (error.code === 'auth/invalid-email') {
        errorMsg = '無效的電子信箱格式！';
      }
      showToast(errorMsg, 'error');
      shakeCard(views.auth);
    } finally {
      btnAuthSubmit.disabled = false;
      authSubmitText.textContent = originalText;
    }
  }
});

// Guest Sign-in (Hybrid Mode)
btnGuestLogin.addEventListener('click', async () => {
  btnGuestLogin.disabled = true;
  const originalHtml = btnGuestLogin.innerHTML;
  btnGuestLogin.innerHTML = '<span>載入中...</span>';
  
  if (isMockMode) {
    // Mock Guest Login
    setTimeout(() => {
      currentUser = { uid: 'mock-guest', email: 'guest@example.com', isAnonymous: true };
      sessionStorage.setItem('cloud_tasks_current_user', JSON.stringify(currentUser));
      updateUserUI(currentUser);
      setupMockDatabaseSync(currentUser);
      switchView('todo');
      showToast('以訪客身份登入成功！', 'success');
      btnGuestLogin.disabled = false;
      btnGuestLogin.innerHTML = originalHtml;
    }, 400);
  } else {
    // Real Firebase Anonymous login
    if (!window.fbActions) {
      btnGuestLogin.disabled = false;
      btnGuestLogin.innerHTML = originalHtml;
      return;
    }
    
    try {
      await window.fbActions.signInAnonymously(auth);
    } catch (error) {
      console.error('Guest Auth failed:', error);
      showToast('訪客登入失敗，請確認 Firebase Console 中已啟用「匿名登入 (Anonymous)」！', 'error');
      shakeCard(views.auth);
    } finally {
      btnGuestLogin.disabled = false;
      btnGuestLogin.innerHTML = originalHtml;
    }
  }
});

// Logout (Hybrid Mode)
btnLogout.addEventListener('click', async () => {
  if (isMockMode) {
    currentUser = null;
    sessionStorage.removeItem('cloud_tasks_current_user');
    cleanupMockDatabaseSync();
    switchView('landing');
    showToast('已登出本地模式！', 'info');
  } else {
    if (!window.fbActions) return;
    try {
      await window.fbActions.signOut(auth);
      showToast('已安全登出！', 'info');
    } catch (error) {
      console.error('Logout failed:', error);
      showToast('登出失敗，請重試！', 'error');
    }
  }
});

// Update UI info based on current logged in user
function updateUserUI(user) {
  const isAnon = user.isAnonymous || user.uid === 'mock-guest';
  if (isAnon) {
    userDisplayName.textContent = '體驗訪客';
    userAvatarText.textContent = 'G';
    userStatusBadge.textContent = '訪客模式';
    userStatusBadge.style.color = '#cbd5e1';
    userStatusBadge.style.backgroundColor = 'rgba(255,255,255,0.08)';
  } else {
    const name = user.email.split('@')[0];
    userDisplayName.textContent = name;
    userAvatarText.textContent = name.charAt(0).toUpperCase();
    userStatusBadge.textContent = isMockMode ? '本地會員' : '同步會員';
    userStatusBadge.style.color = 'var(--color-accent-blue)';
    userStatusBadge.style.backgroundColor = 'rgba(6, 182, 212, 0.1)';
  }
}

// ==========================================================================
// 1. Real Firebase DB Operations & Sync
// ==========================================================================
function setupDatabaseSync(user) {
  if (!window.fbActions || !database) return;
  
  const { ref, onValue } = window.fbActions;
  dbRef = ref(database);
  tasksRef = ref(database, `users/${user.uid}/tasks`);
  
  onValue(tasksRef, (snapshot) => {
    const val = snapshot.val();
    tasksList = [];
    
    if (val) {
      Object.keys(val).forEach(key => {
        tasksList.push({
          id: key,
          ...val[key]
        });
      });
      sortTasks();
    }
    
    renderTasks();
    updateProgress();
  }, (error) => {
    console.error('Database subscription error:', error);
    showToast('讀取資料庫失敗，請確認 Firebase 規則設定！', 'error');
  });
}

function cleanupDatabaseSync() {
  if (window.fbActions && database && tasksRef) {
    window.fbActions.off(tasksRef);
  }
  tasksList = [];
  renderTasks();
}

// ==========================================================================
// 2. Mock LocalStorage DB Operations & Sync
// ==========================================================================
function setupMockDatabaseSync(user) {
  const rawTasks = localStorage.getItem(`cloud_tasks_mock_tasks_${user.uid}`);
  tasksList = rawTasks ? JSON.parse(rawTasks) : [];
  sortTasks();
  renderTasks();
  updateProgress();
}

function cleanupMockDatabaseSync() {
  tasksList = [];
  renderTasks();
}

function saveMockTasks() {
  if (!currentUser) return;
  localStorage.setItem(`cloud_tasks_mock_tasks_${currentUser.uid}`, JSON.stringify(tasksList));
  sortTasks();
  renderTasks();
  updateProgress();
}

// Helpers
function sortTasks() {
  tasksList.sort((a, b) => {
    if (a.completed !== b.completed) {
      return a.completed ? 1 : -1;
    }
    return b.createdAt - a.createdAt;
  });
}

// ==========================================================================
// Task CRUD handlers (Unified for Firebase/Mock)
// ==========================================================================

// Add task
todoForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const text = todoInput.value.trim();
  if (!text) return;
  
  todoInput.disabled = true;
  
  if (isMockMode) {
    const newTask = {
      id: 'mock-task-' + Date.now(),
      text: text,
      completed: false,
      createdAt: Date.now()
    };
    tasksList.push(newTask);
    saveMockTasks();
    todoInput.value = '';
    showToast('已新增待辦事項！（本地端）', 'success');
    todoInput.disabled = false;
    todoInput.focus();
  } else {
    if (!window.fbActions || !tasksRef) return;
    try {
      const { push, set } = window.fbActions;
      const newTaskRef = push(tasksRef);
      await set(newTaskRef, {
        text: text,
        completed: false,
        createdAt: Date.now()
      });
      
      todoInput.value = '';
      showToast('已新增待辦事項！', 'success');
    } catch (error) {
      console.error('Failed to add task:', error);
      showToast('儲存失敗，請檢查資料庫權限！', 'error');
    } finally {
      todoInput.disabled = false;
      todoInput.focus();
    }
  }
});

// Update checked state
async function toggleTaskComplete(taskId, currentStatus) {
  if (isMockMode) {
    const task = tasksList.find(t => t.id === taskId);
    if (task) {
      task.completed = !currentStatus;
      saveMockTasks();
    }
  } else {
    if (!window.fbActions || !database || !currentUser) return;
    try {
      const { ref, update } = window.fbActions;
      const taskRef = ref(database, `users/${currentUser.uid}/tasks/${taskId}`);
      await update(taskRef, {
        completed: !currentStatus
      });
    } catch (error) {
      console.error('Failed to toggle task:', error);
      showToast('更新失敗！', 'error');
    }
  }
}

// Delete task
async function deleteTask(taskId) {
  if (isMockMode) {
    tasksList = tasksList.filter(t => t.id !== taskId);
    saveMockTasks();
    showToast('已刪除待辦事項！（本地端）', 'info');
  } else {
    if (!window.fbActions || !database || !currentUser) return;
    try {
      const { ref, remove } = window.fbActions;
      const taskRef = ref(database, `users/${currentUser.uid}/tasks/${taskId}`);
      await remove(taskRef);
      showToast('已刪除待辦事項！', 'info');
    } catch (error) {
      console.error('Failed to delete task:', error);
      showToast('刪除失敗！', 'error');
    }
  }
}

// Render dynamic todo list
function renderTasks() {
  todoList.innerHTML = '';
  
  const filteredTasks = tasksList.filter(task => {
    if (currentFilter === 'active') return !task.completed;
    if (currentFilter === 'completed') return task.completed;
    return true;
  });
  
  if (filteredTasks.length === 0) {
    todoEmptyState.style.display = 'flex';
  } else {
    todoEmptyState.style.display = 'none';
    
    filteredTasks.forEach(task => {
      const li = document.createElement('li');
      li.className = 'todo-item';
      
      li.innerHTML = `
        <div class="todo-item-left">
          <label class="todo-checkbox-wrapper">
            <input type="checkbox" ${task.completed ? 'checked' : ''} data-id="${task.id}">
            <div class="custom-checkbox">
              <i data-lucide="check" class="checkbox-check-icon"></i>
            </div>
            <span class="todo-text">${escapeHtml(task.text)}</span>
          </label>
        </div>
        <button class="btn-icon-only btn-delete-task" data-id="${task.id}" title="刪除">
          <i data-lucide="trash-2"></i>
        </button>
      `;
      
      // Hook event listeners
      const checkbox = li.querySelector('input[type="checkbox"]');
      checkbox.addEventListener('change', () => {
        toggleTaskComplete(task.id, task.completed);
      });
      
      const deleteBtn = li.querySelector('.btn-delete-task');
      deleteBtn.addEventListener('click', () => {
        deleteTask(task.id);
      });
      
      todoList.appendChild(li);
    });
    
    lucide.createIcons();
  }
}

// Update UI metrics for completed rate
function updateProgress() {
  const total = tasksList.length;
  const completed = tasksList.filter(t => t.completed).length;
  const percentage = total === 0 ? 0 : Math.round((completed / total) * 100);
  
  progressBarFill.style.width = `${percentage}%`;
  progressPercentageText.textContent = `${percentage}%`;
  progressCountText.textContent = `${completed} / ${total} 已完成`;
}

// Filter switching tabs
filterTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    filterTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    
    currentFilter = tab.getAttribute('data-filter');
    renderTasks();
  });
});

// Escape HTML utility helper
function escapeHtml(str) {
  const div = document.createElement('div');
  div.innerText = str;
  return div.innerHTML;
}

// ==========================================================================
// Initialization
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
  lucide.createIcons();
  startApp();
});
