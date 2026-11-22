// ==========================================
// 1. SUPABASE CONFIGURATION & STATE
// ==========================================
const SUPABASE_URL = 'https://ymdbqfkedpmdaiywhztt.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_00aQjnrnFCHsuqbki8kOLg_jKy4Nk2o'.trim();

const supabaseClient =
  window.supabase && typeof window.supabase.createClient === 'function'
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

// App State
let closetItems = [];
let activeCategoryFilter = 'All';
let selectedStyle = localStorage.getItem('user_style_persona') || 'Minimalist';
let isSignUpMode = false;
let currentWeather = {
  tempF: null,
  condition: 'mild' // 'cold' (< 60°F), 'mild' (60–75°F), 'warm' (> 75°F)
};

// Starter items for first-time local demo visitors
const STARTER_CLOSET = [
  { id: 'demo-1', name: 'Crisp White Tee', category: 'Top', color: 'White' },
  { id: 'demo-2', name: 'Straight-Leg Blue Jeans', category: 'Bottom', color: 'Blue' },
  { id: 'demo-3', name: 'Tailored Black Blazer', category: 'Outerwear', color: 'Black' },
  { id: 'demo-4', name: 'White Leather Sneakers', category: 'Shoes', color: 'White' },
  { id: 'demo-5', name: 'Beige Trench Coat', category: 'Outerwear', color: 'Beige' }
];

// Color Harmony Matrix
const COLOR_PAIRINGS = {
  Black: ['White', 'Gray', 'Beige', 'Blue', 'Red', 'Black', 'Green'],
  White: ['Black', 'Blue', 'Navy', 'Beige', 'Gray', 'Green', 'Brown', 'Red'],
  Blue: ['White', 'Black', 'Beige', 'Gray', 'Brown', 'Navy'],
  Navy: ['White', 'Beige', 'Gray', 'Blue', 'Brown', 'Red'],
  Gray: ['Black', 'White', 'Blue', 'Navy', 'Red', 'Green'],
  Beige: ['White', 'Black', 'Brown', 'Blue', 'Navy', 'Green'],
  Brown: ['White', 'Beige', 'Blue', 'Navy', 'Green'],
  Green: ['White', 'Black', 'Beige', 'Brown', 'Blue'],
  Red: ['Black', 'White', 'Navy', 'Blue', 'Gray']
};

// ==========================================
// 2. WEATHER API INTEGRATION (OPEN-METEO)
// ==========================================
async function fetchLocalWeather() {
  const weatherBadges = document.querySelectorAll('#weather-status-badge');

  async function loadWeatherForCoords(lat, lon, label) {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m&temperature_unit=fahrenheit`;
      const response = await fetch(url);
      const data = await response.json();

      if (data && data.current && typeof data.current.temperature_2m === 'number') {
        const temp = Math.round(data.current.temperature_2m);
        currentWeather.tempF = temp;

        if (temp < 60) {
          currentWeather.condition = 'cold';
        } else if (temp > 75) {
          currentWeather.condition = 'warm';
        } else {
          currentWeather.condition = 'mild';
        }

        const icon = temp < 60 ? '🧥' : temp > 75 ? '☀️' : '🌤️';
        weatherBadges.forEach((el) => {
          el.innerHTML = `<h3>${icon} ${label} Weather: ${temp}°F (${currentWeather.condition.toUpperCase()})</h3>`;
        });
      }
    } catch (error) {
      console.error('Weather fetch failed:', error);
      weatherBadges.forEach((el) => {
        el.innerHTML = '<h3>🌤️ Weather unavailable (standard styling)</h3>';
      });
    }
  }

  // 1. Load default NYC weather immediately so it never hangs
  await loadWeatherForCoords(40.7128, -74.0060, 'NYC');

  // 2. Upgrade to exact user location if granted
  if ('geolocation' in navigator) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        loadWeatherForCoords(pos.coords.latitude, pos.coords.longitude, 'Local');
      },
      () => {},
      { timeout: 5000 }
    );
  }
}

// ==========================================
// 3. DATA LAYER (SUPABASE + LOCAL FALLBACK)
// ==========================================
async function fetchClosetItems() {
  const statusEl = document.getElementById('db-status-text');

  if (supabaseClient) {
    const { data: { session } } = await supabaseClient.auth.getSession();
    const user = session?.user;

    if (user) {
      if (statusEl) {
        statusEl.textContent = `Connected & Synced as ${user.email}`;
      }

      // Fetch only this logged-in user's saved closet items
      const { data, error } = await supabaseClient
        .from('closet_items')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (!error && data) {
        closetItems = data;
        renderCloset();
        return;
      } else {
        console.error('Supabase fetch error:', error);
        if (statusEl) statusEl.textContent = `Sync error: ${error.message}`;
        return;
      }
    } else if (statusEl) {
      statusEl.textContent = 'Guest Mode (Log in to save items permanently to the cloud)';
    }
  } else if (statusEl) {
    statusEl.textContent = 'Running in Local Demo Mode';
  }

  // Guest / LocalStorage fallback when not logged in
  const saved = localStorage.getItem('virtual_closet_items');
  if (saved) {
    closetItems = JSON.parse(saved);
  } else {
    closetItems = [...STARTER_CLOSET];
    localStorage.setItem('virtual_closet_items', JSON.stringify(closetItems));
  }
  renderCloset();
}

async function createClosetItem(newItem) {
  if (supabaseClient) {
    const { data: { session } } = await supabaseClient.auth.getSession();
    const user = session?.user;

    if (user) {
      const payload = {
        name: newItem.name,
        category: newItem.category,
        color: newItem.color,
        user_id: user.id
      };

      const { data, error } = await supabaseClient
        .from('closet_items')
        .insert([payload])
        .select();

      if (!error && data && data[0]) {
        closetItems.unshift(data[0]);
        renderCloset();
        return;
      } else {
        console.error('Insert error:', error);
        alert(`Could not save to cloud: ${error?.message || 'Unknown error'}`);
        return;
      }
    }
  }

  // Guest local fallback (when logged out)
  const itemWithId = { ...newItem, id: Date.now().toString() };
  closetItems.unshift(itemWithId);
  localStorage.setItem('virtual_closet_items', JSON.stringify(closetItems));
  renderCloset();
}

async function deleteClosetItem(itemId) {
  if (supabaseClient && !String(itemId).startsWith('demo-')) {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session?.user) {
      const { error } = await supabaseClient
        .from('closet_items')
        .delete()
        .eq('id', itemId)
        .eq('user_id', session.user.id);

      if (error) {
        console.error('Delete error:', error);
        return;
      }
    }
  }

  closetItems = closetItems.filter((item) => String(item.id) !== String(itemId));
  localStorage.setItem('virtual_closet_items', JSON.stringify(closetItems));
  renderCloset();
}

// ==========================================
// 4. STYLING & OUTFIT ENGINE (WEATHER-AWARE)
// ==========================================
function generateOutfitMatches(targetItem) {
  const compatibleColors = COLOR_PAIRINGS[targetItem.color] || ['Black', 'White', 'Blue'];

  const matchingItems = closetItems.filter((item) =>
    compatibleColors.includes(item.color)
  );

  const tops = matchingItems.filter((i) => i.category === 'Top');
  const bottoms = matchingItems.filter((i) => i.category === 'Bottom');
  const shoes = matchingItems.filter((i) => i.category === 'Shoes');
  const outerwear = matchingItems.filter((i) => i.category === 'Outerwear');

  const outfits = [];
  const totalCombinations = Math.max(tops.length, 1) * Math.max(bottoms.length, 1);
  const maxLooks = Math.min(3, totalCombinations);

  const isCold = currentWeather.condition === 'cold';
  const isWarm = currentWeather.condition === 'warm';

  for (let i = 0; i < maxLooks; i++) {
    const pieces = [`🆕 ${targetItem.name} (${targetItem.color})`];

    const topItem = tops.length > 0 ? tops[i % tops.length] : null;
    const bottomItem = bottoms.length > 0 ? bottoms[i % bottoms.length] : null;
    const shoeItem = shoes.length > 0 ? shoes[i % shoes.length] : null;
    const outerItem = outerwear.length > 0 ? outerwear[i % outerwear.length] : null;

    if (targetItem.category === 'Top') {
      if (bottomItem) pieces.push(`👖 ${bottomItem.name}`);
      if (shoeItem) pieces.push(`👟 ${shoeItem.name}`);
      if (outerItem && (isCold || (!isWarm && i === 0))) {
        pieces.push(`🧥 ${outerItem.name}`);
      }
    } else if (targetItem.category === 'Bottom') {
      if (topItem) pieces.push(`👕 ${topItem.name}`);
      if (shoeItem) pieces.push(`👟 ${shoeItem.name}`);
      if (outerItem && (isCold || (!isWarm && i === 0))) {
        pieces.push(`🧥 ${outerItem.name}`);
      }
    } else if (targetItem.category === 'Outerwear') {
      if (topItem) pieces.push(`👕 ${topItem.name}`);
      if (bottomItem) pieces.push(`👖 ${bottomItem.name}`);
      if (shoeItem) pieces.push(`👟 ${shoeItem.name}`);
    } else if (targetItem.category === 'Shoes') {
      if (topItem) pieces.push(`👕 ${topItem.name}`);
      if (bottomItem) pieces.push(`👖 ${bottomItem.name}`);
      if (outerItem && isCold) {
        pieces.push(`🧥 ${outerItem.name}`);
      }
    } else {
      if (topItem) pieces.push(`👕 ${topItem.name}`);
      if (bottomItem) pieces.push(`👖 ${bottomItem.name}`);
      if (shoeItem) pieces.push(`👟 ${shoeItem.name}`);
    }

    outfits.push({
      label: `Look #${outfits.length + 1} — ${selectedStyle} Vibe`,
      pieces
    });
  }

  const score = Math.min(98, Math.max(68, 70 + matchingItems.length * 5));

  const styleNotes = {
    Minimalist: `Keep the silhouette clean. Let the ${targetItem.color.toLowerCase()} tone anchor the look without competing patterns.`,
    Streetwear: `Play with proportions—pair this ${targetItem.color.toLowerCase()} piece with relaxed fits and your cleanest sneakers.`,
    'Smart Casual': `Balance structured and relaxed textures. Tucking in your top or adding a layer elevates this effortlessly.`,
    'Classic Chic': `Stick to intentional color blocking and refined footwear so the ${targetItem.name} looks tailored.`
  };

  let weatherTip = '';
  if (currentWeather.tempF !== null) {
    if (isCold) {
      weatherTip = ` Since it's chilly (${currentWeather.tempF}°F), we prioritized layering pieces to keep you warm.`;
    } else if (isWarm) {
      weatherTip = ` With warm ${currentWeather.tempF}°F weather, we kept the look breathable and skipped heavy layers.`;
    } else {
      weatherTip = ` Great fit for today's mild ${currentWeather.tempF}°F weather.`;
    }
  }

  return {
    score,
    advice: (styleNotes[selectedStyle] || styleNotes.Minimalist) + weatherTip,
    outfits
  };
}

// ==========================================
// 5. UI RENDERING
// ==========================================
function renderCloset() {
  const grid = document.getElementById('closet-grid');
  const countEl = document.getElementById('closet-count');
  if (!grid) return;

  if (countEl) {
    countEl.textContent = `${closetItems.length} item${closetItems.length === 1 ? '' : 's'} saved`;
  }

  const filteredItems =
    activeCategoryFilter === 'All'
      ? closetItems
      : closetItems.filter((item) => item.category === activeCategoryFilter);

  if (filteredItems.length === 0) {
    grid.innerHTML = `<p style="color:#777; grid-column: 1 / -1;">No items found in this category. Click "+ Add Item" to build your closet!</p>`;
    return;
  }

  const categoryIcons = {
    Top: '👕',
    Bottom: '👖',
    Outerwear: '🧥',
    Shoes: '👟',
    Accessory: '👜'
  };

  grid.innerHTML = filteredItems
    .map(
      (item) => `
      <div class="closet-card">
        <div class="closet-card-info">
          <span class="item-icon">${categoryIcons[item.category] || '👗'}</span>
          <div>
            <strong>${item.name}</strong>
            <div class="item-meta">${item.category} • ${item.color}</div>
          </div>
        </div>
        <button class="delete-btn" onclick="deleteClosetItem('${item.id}')" title="Remove item">✕</button>
      </div>
    `
    )
    .join('');
}

function renderMatchResults(result) {
  const resultsContainer = document.getElementById('match-results');
  const scoreEl = document.getElementById('match-score');
  const adviceEl = document.getElementById('styling-advice');
  const cardsContainer = document.getElementById('outfit-cards');

  if (!resultsContainer) return;

  resultsContainer.classList.remove('hidden');
  if (scoreEl) scoreEl.textContent = `${result.score}% Match`;
  if (adviceEl) adviceEl.textContent = result.advice;

  if (cardsContainer) {
    cardsContainer.innerHTML = result.outfits
      .map(
        (outfit) => `
        <div class="outfit-card">
          <h4>${outfit.label}</h4>
          <ul>
            ${outfit.pieces.map((p) => `<li>${p}</li>`).join('')}
          </ul>
        </div>
      `
      )
      .join('');
  }
}

// ==========================================
// 6. AUTHENTICATION HANDLERS
// ==========================================
async function updateAuthUI() {
  const authBtn = document.getElementById('open-auth-btn');
  if (!supabaseClient || !authBtn) return;

  const { data: { session } } = await supabaseClient.auth.getSession();
  authBtn.textContent = session?.user ? 'Log Out' : 'Log In';
}

function setAuthModalMode(signUp) {
  isSignUpMode = signUp;
  const titleEl = document.getElementById('auth-modal-title');
  const subtitleEl = document.getElementById('auth-modal-subtitle');
  const submitBtn = document.getElementById('auth-submit-btn');
  const switchText = document.getElementById('auth-switch-text');
  const switchBtn = document.getElementById('toggle-auth-mode');
  const errorEl = document.getElementById('auth-error-msg');

  if (errorEl) errorEl.classList.add('hidden');

  if (isSignUpMode) {
    if (titleEl) titleEl.textContent = 'Create Account';
    if (subtitleEl) subtitleEl.textContent = 'Sign up to sync your virtual closet to the cloud.';
    if (submitBtn) submitBtn.textContent = 'Sign Up';
    if (switchText) switchText.textContent = 'Already have an account?';
    if (switchBtn) switchBtn.textContent = 'Log In';
  } else {
    if (titleEl) titleEl.textContent = 'Welcome Back';
    if (subtitleEl) subtitleEl.textContent = 'Log in to access your saved virtual closet anywhere.';
    if (submitBtn) submitBtn.textContent = 'Log In';
    if (switchText) switchText.textContent = "Don't have an account?";
    if (switchBtn) switchBtn.textContent = 'Sign Up';
  }
}

async function handleAuthSubmit(email, password) {
  const errorEl = document.getElementById('auth-error-msg');
  const modal = document.getElementById('auth-modal');

  if (!supabaseClient) {
    if (errorEl) {
      errorEl.textContent = 'Supabase client failed to initialize.';
      errorEl.classList.remove('hidden');
    }
    return;
  }

  let authResponse;
  if (isSignUpMode) {
    authResponse = await supabaseClient.auth.signUp({ email, password });
  } else {
    authResponse = await supabaseClient.auth.signInWithPassword({ email, password });
  }

  if (authResponse.error) {
    if (errorEl) {
      errorEl.textContent = authResponse.error.message;
      errorEl.classList.remove('hidden');
    }
    return;
  }

  if (modal) modal.classList.add('hidden');
  await updateAuthUI();
  await fetchClosetItems();
}

// ==========================================
// 7. EVENT LISTENERS & INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  // 1. Bottom Navigation Tabs ("Style Check" / "My Closet" / "My Style")
  const navButtons = document.querySelectorAll('.bottom-nav .nav-item');
  const tabPanels = document.querySelectorAll('.tab-panel');

  navButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      if (!targetId) return;

      navButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      tabPanels.forEach((panel) => {
        panel.classList.toggle('active', panel.id === targetId);
      });
    });
  });

  // 2. Style Matcher Form (Tab 1)
  const matcherForm = document.getElementById('matcher-form');
  if (matcherForm) {
    matcherForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('buy-name').value.trim();
      const category = document.getElementById('buy-category').value;
      const color = document.getElementById('buy-color').value;
      if (!name) return;

      const targetItem = { name, category, color };
      const matchResult = generateOutfitMatches(targetItem);
      renderMatchResults(matchResult);
    });
  }

  // 3. My Closet Drawer Toggle & Add Form (Tab 2)
  const toggleAddBtn = document.getElementById('toggle-add-btn');
  const cancelAddBtn = document.getElementById('cancel-add-btn');
  const addClosetForm = document.getElementById('add-closet-form');

  if (toggleAddBtn && addClosetForm) {
    toggleAddBtn.addEventListener('click', () => {
      addClosetForm.classList.toggle('hidden');
    });
  }

  if (cancelAddBtn && addClosetForm) {
    cancelAddBtn.addEventListener('click', () => {
      addClosetForm.classList.add('hidden');
      addClosetForm.reset();
    });
  }

  if (addClosetForm) {
    addClosetForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('item-name').value.trim();
      const category = document.getElementById('item-category').value;
      const color = document.getElementById('item-color').value;
      if (!name) return;

      await createClosetItem({ name, category, color });
      addClosetForm.reset();
      addClosetForm.classList.add('hidden');
    });
  }

  // 4. Closet Category Filter Chips (Tab 2)
  const filterChips = document.querySelectorAll('#closet-filters .filter-chip');
  filterChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      filterChips.forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      activeCategoryFilter = chip.dataset.filter || 'All';
      renderCloset();
    });
  });

  // 5. Style Persona Cards (Tab 3)
  const activeStyleBadge = document.getElementById('active-style-badge');
  const personaCards = document.querySelectorAll('#persona-list .persona-card');

  if (activeStyleBadge) activeStyleBadge.textContent = selectedStyle;

  personaCards.forEach((card) => {
    card.classList.toggle('active', card.dataset.style === selectedStyle);

    card.addEventListener('click', () => {
      personaCards.forEach((c) => c.classList.remove('active'));
      card.classList.add('active');
      selectedStyle = card.dataset.style;
      localStorage.setItem('user_style_persona', selectedStyle);
      if (activeStyleBadge) activeStyleBadge.textContent = selectedStyle;
    });
  });

  // 6. Auth Modal & Login/Sign Up Handlers
  const openAuthBtn = document.getElementById('open-auth-btn');
  const closeAuthBtn = document.getElementById('close-auth-btn');
  const authModal = document.getElementById('auth-modal');
  const toggleAuthModeBtn = document.getElementById('toggle-auth-mode');
  const authForm = document.getElementById('auth-form');

  if (openAuthBtn) {
    openAuthBtn.addEventListener('click', async () => {
      if (supabaseClient) {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session?.user) {
          await supabaseClient.auth.signOut();
          await updateAuthUI();
          await fetchClosetItems();
          return;
        }
      }
      setAuthModalMode(false);
      if (authModal) authModal.classList.remove('hidden');
    });
  }

  if (closeAuthBtn && authModal) {
    closeAuthBtn.addEventListener('click', () => {
      authModal.classList.add('hidden');
    });
  }

  if (toggleAuthModeBtn) {
    toggleAuthModeBtn.addEventListener('click', () => {
      setAuthModalMode(!isSignUpMode);
    });
  }

  if (authForm) {
    authForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('auth-email').value.trim();
      const password = document.getElementById('auth-password').value;
      if (email && password) {
        await handleAuthSubmit(email, password);
      }
    });
  }

  // 7. Supabase Auth Listener & Initial Data Load
  if (supabaseClient) {
    supabaseClient.auth.onAuthStateChange(async () => {
      await updateAuthUI();
      await fetchClosetItems();
    });
  }

  updateAuthUI();
  fetchClosetItems();
  fetchLocalWeather();
});
