// ==========================================
// 1. SUPABASE CONFIGURATION & STATE
// ==========================================
const SUPABASE_URL = 'https://ymdbqfkedpmdaiywhztt.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_00aQjnrnFCHsuqbki8kOLg_jKy4Nk2o'.trim();

// Safely initialize Supabase client from CDN
const supabaseClient =
  window.supabase && typeof window.supabase.createClient === 'function'
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

// App State
let closetItems = [];
let selectedStyle = localStorage.getItem('user_style_persona') || 'Minimalist';
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
  const weatherEl = document.getElementById('weather-status-badge');

  // Default fallback coordinates (New York, NY) if user declines location permission
  let lat = 40.7128;
  let lon = -74.0060;
  let locationLabel = 'NYC';

  try {
    if ('geolocation' in navigator) {
      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
      });
      lat = pos.coords.latitude;
      lon = pos.coords.longitude;
      locationLabel = 'Local';
    }
  } catch (err) {
    console.log('Location permission skipped; using default city weather.');
  }

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&temperature_unit=fahrenheit`;
    const response = await fetch(url);
    const data = await response.json();

    if (data && data.current_weather) {
      const temp = Math.round(data.current_weather.temperature);
      currentWeather.tempF = temp;

      if (temp < 60) {
        currentWeather.condition = 'cold';
      } else if (temp > 75) {
        currentWeather.condition = 'warm';
      } else {
        currentWeather.condition = 'mild';
      }

      if (weatherEl) {
        const icon = temp < 60 ? '🧥' : temp > 75 ? '☀️' : '🌤️';
        weatherEl.textContent = `${icon} ${locationLabel} Weather: ${temp}°F (${currentWeather.condition.toUpperCase()})`;
      }
    }
  } catch (error) {
    console.error('Weather fetch failed:', error);
    if (weatherEl) {
      weatherEl.textContent = '🌤️ Weather unavailable (standard styling)';
    }
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

    if (statusEl) {
      statusEl.textContent = user
        ? `Connected as ${user.email}`
        : 'Connected to Supabase Cloud Database';
    }

    const { data, error } = await supabaseClient
      .from('closet_items')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      closetItems = data;
      renderCloset();
      return;
    } else {
      console.error('Supabase fetch error:', error);
      if (statusEl) statusEl.textContent = 'Supabase error — using local backup';
    }
  } else if (statusEl) {
    statusEl.textContent = 'Running in Local Demo Mode';
  }

  // LocalStorage fallback
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
    const userId = session?.user?.id;

    const payload = {
      name: newItem.name,
      category: newItem.category,
      color: newItem.color
    };

    if (userId) {
      payload.user_id = userId;
    }

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
    }
  }

  // Local fallback
  const itemWithId = { ...newItem, id: Date.now().toString() };
  closetItems.unshift(itemWithId);
  localStorage.setItem('virtual_closet_items', JSON.stringify(closetItems));
  renderCloset();
}

async function deleteClosetItem(itemId) {
  if (supabaseClient && !String(itemId).startsWith('demo-')) {
    const { error } = await supabaseClient
      .from('closet_items')
      .delete()
      .eq('id', itemId);

    if (error) {
      console.error('Delete error:', error);
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

  // Filter closet items that pair well in color
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
// 5. UI RENDERING & INTERACTIONS
// ==========================================
function renderCloset() {
  const grid = document.getElementById('closet-grid');
  const countEl = document.getElementById('closet-count');
  if (!grid) return;

  if (countEl) {
    countEl.textContent = `${closetItems.length} item${closetItems.length === 1 ? '' : 's'}`;
  }

  if (closetItems.length === 0) {
    grid.innerHTML = `<p style="color:#777; grid-column: 1 / -1;">Your closet is empty. Add a piece above to start matching!</p>`;
    return;
  }

  const categoryIcons = {
    Top: '👕',
    Bottom: '👖',
    Outerwear: '🧥',
    Shoes: '👟'
  };

  grid.innerHTML = closetItems
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

function renderMatchResults(targetItem, result) {
  const resultsContainer = document.getElementById('match-results');
  if (!resultsContainer) return;

  resultsContainer.style.display = 'block';
  resultsContainer.innerHTML = `
    <div class="match-header">
      <div>
        <h3>Styling: ${targetItem.name}</h3>
        <p class="style-advice">${result.advice}</p>
      </div>
      <div class="versatility-badge">
        <span class="score-number">${result.score}%</span>
        <span class="score-label">Closet Match</span>
      </div>
    </div>
    <div class="outfits-list">
      ${result.outfits
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
        .join('')}
    </div>
  `;
}

// ==========================================
// 6. AUTHENTICATION HANDLERS
// ==========================================
async function updateAuthUI() {
  const authBtn = document.getElementById('auth-btn');
  const userEmailDisplay = document.getElementById('user-email-display');
  if (!supabaseClient || !authBtn) return;

  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session?.user) {
    authBtn.textContent = 'Log Out';
    if (userEmailDisplay) userEmailDisplay.textContent = session.user.email;
  } else {
    authBtn.textContent = 'Log In';
    if (userEmailDisplay) userEmailDisplay.textContent = '';
  }
}

async function handleAuthAction() {
  if (!supabaseClient) {
    alert('Supabase client failed to initialize. Check your URL and Anon Key in app.js.');
    return;
  }

  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session?.user) {
    await supabaseClient.auth.signOut();
    await updateAuthUI();
    await fetchClosetItems();
    return;
  }

  const authModal = document.getElementById('auth-modal');
  if (authModal) {
    authModal.style.display = 'flex';
  } else {
    const email = prompt('Enter your email to log in or sign up:');
    const password = prompt('Enter your password (min 6 characters):');
    if (email && password) {
      await signInOrSignUp(email, password);
    }
  }
}

async function signInOrSignUp(email, password) {
  if (!supabaseClient) return;

  let { error } = await supabaseClient.auth.signInWithPassword({ email, password });

  if (error) {
    const signUpRes = await supabaseClient.auth.signUp({ email, password });
    if (signUpRes.error) {
      alert(`Authentication error: ${signUpRes.error.message}`);
      return;
    } else {
      alert('Account created! If email confirmation is enabled, check your inbox.');
    }
  }

  const authModal = document.getElementById('auth-modal');
  if (authModal) authModal.style.display = 'none';

  await updateAuthUI();
  await fetchClosetItems();
}

// ==========================================
// 7. EVENT LISTENERS & INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  // 1. Add Item Form
  const addForm = document.getElementById('add-item-form');
  if (addForm) {
    addForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('item-name').value.trim();
      const category = document.getElementById('item-category').value;
      const color = document.getElementById('item-color').value;
      if (!name) return;

      await createClosetItem({ name, category, color });
      addForm.reset();
    });
  }

  // 2. Test / Match Item Form
  const testForm = document.getElementById('test-item-form');
  if (testForm) {
    testForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('test-item-name').value.trim();
      const category = document.getElementById('test-item-category').value;
      const color = document.getElementById('test-item-color').value;
      if (!name) return;

      const targetItem = { name, category, color };
      const matchResult = generateOutfitMatches(targetItem);
      renderMatchResults(targetItem, matchResult);
    });
  }

  // 3. Style Persona Selector
  const styleButtons = document.querySelectorAll('.style-pill, [data-style]');
  styleButtons.forEach((btn) => {
    if (btn.dataset.style === selectedStyle) {
      btn.classList.add('active');
    }
    btn.addEventListener('click', () => {
      styleButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      selectedStyle = btn.dataset.style;
      localStorage.setItem('user_style_persona', selectedStyle);
    });
  });

  // 4. Auth Button & Modal Form
  const authBtn = document.getElementById('auth-btn');
  if (authBtn) {
    authBtn.addEventListener('click', handleAuthAction);
  }

  const authForm = document.getElementById('auth-form');
  if (authForm) {
    authForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('auth-email').value.trim();
      const password = document.getElementById('auth-password').value;
      if (email && password) {
        await signInOrSignUp(email, password);
      }
    });
  }

  const closeModalBtn = document.getElementById('close-auth-modal');
  if (closeModalBtn) {
    closeModalBtn.addEventListener('click', () => {
      const authModal = document.getElementById('auth-modal');
      if (authModal) authModal.style.display = 'none';
    });
  }

  // 5. Listen for Supabase Auth State Changes
  if (supabaseClient) {
    supabaseClient.auth.onAuthStateChange(async () => {
      await updateAuthUI();
      await fetchClosetItems();
    });
  }

  // 6. Initialize App Data & Weather
  updateAuthUI();
  fetchClosetItems();
  fetchLocalWeather();
});
