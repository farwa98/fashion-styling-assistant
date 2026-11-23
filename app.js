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
  { id: 'demo-2', name: 'Black Ribbed Turtleneck', category: 'Top', color: 'Black' },
  { id: 'demo-3', name: 'Straight-Leg Blue Jeans', category: 'Bottom', color: 'Blue' },
  { id: 'demo-4', name: 'Tailored Beige Trousers', category: 'Bottom', color: 'Beige' },
  { id: 'demo-5', name: 'White Leather Sneakers', category: 'Shoes', color: 'White' },
  { id: 'demo-6', name: 'Black Chelsea Boots', category: 'Shoes', color: 'Black' },
  { id: 'demo-7', name: 'Classic Trench Coat', category: 'Outerwear', color: 'Beige' },
  { id: 'demo-8', name: 'Structured Wool Blazer', category: 'Outerwear', color: 'Black' }
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

      const { data, error } = await supabaseClient
        .from('closet_items')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (!error && data) {
        // If this logged-in user has an empty closet, seed starter items into Supabase
        if (data.length === 0) {
          const starterRows = STARTER_CLOSET.map((item) => ({
            name: item.name,
            category: item.category,
            color: item.color,
            user_id: user.id
          }));

          const { data: seededData, error: seedError } = await supabaseClient
            .from('closet_items')
            .insert(starterRows)
            .select();

          closetItems = !seedError && seededData ? seededData : [...STARTER_CLOSET];
        } else {
          closetItems = data;
        }

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
  const compatibleColors = COLOR_PAIRINGS[targetItem.color] || ['Black', 'White', 'Blue', 'Beige'];
  const norm = (val) => (val || '').trim().toLowerCase();

  // 1. Deduplicate closet items by name + category + color
  const uniqueCloset = [];
  const seenItems = new Set();
  for (const item of closetItems) {
    const key = `${norm(item.name)}|${norm(item.category)}|${norm(item.color)}`;
    if (!seenItems.has(key)) {
      seenItems.add(key);
      uniqueCloset.push(item);
    }
  }

  // 2. Bucket unique closet items by all 4 core categories
  const allTops = uniqueCloset.filter((i) => norm(i.category) === 'top');
  const allBottoms = uniqueCloset.filter((i) => norm(i.category) === 'bottom');
  const allShoes = uniqueCloset.filter((i) => norm(i.category) === 'shoes');
  const allOuterwear = uniqueCloset.filter((i) => norm(i.category) === 'outerwear');

  // 3. Sort each category so color-compatible closet pieces come first
  const buildOrderedPool = (items, fallbackLabel) => {
    if (items.length === 0) return [{ name: fallbackLabel, color: '', isFallback: true }];
    const matched = items.filter((i) => compatibleColors.includes(i.color));
    const unmatched = items.filter((i) => !compatibleColors.includes(i.color));
    return [...matched, ...unmatched];
  };

  const targetCat = norm(targetItem.category);

  // Exclude the bought category from repeating unless needed; for Outerwear (like Fur Jacket),
  // we pair it with Top + Bottom + Shoes from your closet.
  const topsPool = targetCat === 'top' ? [null] : buildOrderedPool(allTops, 'Suggested: Crisp White Tee');
  const bottomsPool = targetCat === 'bottom' ? [null] : buildOrderedPool(allBottoms, 'Suggested: Straight-Leg Jeans');
  const shoesPool = targetCat === 'shoes' ? [null] : buildOrderedPool(allShoes, 'Suggested: White Leather Sneakers');
  const outerwearPool = targetCat === 'outerwear' ? [null] : buildOrderedPool(allOuterwear, 'Suggested: Classic Trench Coat');

  const isCold = currentWeather.condition === 'cold';
  const isWarm = currentWeather.condition === 'warm';

  // 4. Build up to 3 distinct outfit combinations
  const outfits = [];
  const usedSignatures = new Set();

  for (let t = 0; t < topsPool.length; t++) {
    for (let b = 0; b < bottomsPool.length; b++) {
      for (let s = 0; s < shoesPool.length; s++) {
        if (outfits.length >= 3) break;

        const top = topsPool[t];
        const bottom = bottomsPool[b];
        const shoe = shoesPool[s];
        const outer = outerwearPool[0] && !outerwearPool[0].isFallback
          ? outerwearPool[(t + b + s) % outerwearPool.length]
          : null;

        // Start with the new item you want to buy (e.g., Fur Jacket)
        const pieces = [`🆕 ${targetItem.name} (${targetItem.color})`];

        if (top) {
          pieces.push(top.isFallback ? `👕 ${top.name}` : `👕 ${top.name} (${top.color})`);
        }
        if (bottom) {
          pieces.push(bottom.isFallback ? `👖 ${bottom.name}` : `👖 ${bottom.name} (${bottom.color})`);
        }
        if (shoe) {
          pieces.push(shoe.isFallback ? `👟 ${shoe.name}` : `👟 ${shoe.name} (${shoe.color})`);
        }
        // Add closet outerwear only if the user isn't already buying Outerwear (like a Fur Jacket)
        if (outer && targetCat !== 'outerwear' && (isCold || (!isWarm && outfits.length === 0))) {
          pieces.push(`🧥 ${outer.name} (${outer.color})`);
        }

        const signature = pieces.join('||');
        if (!usedSignatures.has(signature)) {
          usedSignatures.add(signature);
          outfits.push({
            label: `Look #${outfits.length + 1} — ${selectedStyle} Vibe`,
            pieces
          });
        }
      }
    }
  }

  const matchingCount = uniqueCloset.filter((item) => compatibleColors.includes(item.color)).length;
  const score = Math.min(98, Math.max(72, 74 + matchingCount * 4));

  const styleNotes = {
    Minimalist: `Keep the silhouette clean. Let the ${targetItem.color.toLowerCase()} ${targetItem.name} anchor the look without competing patterns.`,
    Streetwear: `Play with proportions—pair this ${targetItem.color.toLowerCase()} ${targetItem.name} with relaxed fits and your cleanest sneakers.`,
    'Smart Casual': `Balance structured and relaxed textures so the ${targetItem.name} elevates your everyday pieces effortlessly.`,
    'Classic Chic': `Stick to intentional color blocking and refined footwear so the ${targetItem.name} looks tailored.`
  };

  let weatherTip = '';
  if (currentWeather.tempF !== null) {
    if (isCold) {
      weatherTip = ` Since it's chilly (${currentWeather.tempF}°F), this layered combination will keep you warm.`;
    } else if (isWarm) {
      weatherTip = ` With warm ${currentWeather.tempF}°F weather, keep the base layers light and breathable.`;
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
