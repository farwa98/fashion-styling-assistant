// ==========================================
// 1. SUPABASE CONFIGURATION
// ==========================================
const SUPABASE_URL = 'https://ymdbqfkedpmdaiywhztt.supabase.co';
const SUPABASE_ANON_KEY = ' sb_publishable_00aQjnrnFCHsuqbki8kOLg_jKy4Nk2o';

//const isSupabaseConfigured =
  //SUPABASE_URL !== 'YOUR_SUPABASE_PROJECT_URL' &&
  //SUPABASE_ANON_KEY !== 'YOUR_SUPABASE_ANON_KEY' &&
  //window.supabase;

const supabaseClient = isSupabaseConfigured
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

// ==========================================
// 2. APPLICATION STATE & STARTER DATA
// ==========================================
const STARTER_CLOSET = [
  { id: '1', name: 'White Crewneck T-Shirt', category: 'Top', color: 'White' },
  { id: '2', name: 'Straight-Leg Blue Jeans', category: 'Bottom', color: 'Blue' },
  { id: '3', name: 'Black Tailored Trousers', category: 'Bottom', color: 'Black' },
  { id: '4', name: 'Minimalist White Sneakers', category: 'Shoes', color: 'White' },
  { id: '5', name: 'Charcoal Knit Sweater', category: 'Top', color: 'Gray' },
  { id: '6', name: 'Black Leather Boots', category: 'Shoes', color: 'Black' }
];

let closetItems = [];
let currentFilter = 'All';
let selectedStyle = localStorage.getItem('user_style_persona') || 'Minimalist';

const COLOR_SWATCHES = {
  Black: '#18181b',
  White: '#ffffff',
  Gray: '#71717a',
  Beige: '#d6c7b2',
  Navy: '#1e3a8a',
  Blue: '#3b82f6',
  Green: '#3f6212',
  Red: '#991b1b',
  Brown: '#78350f'
};

// Color Harmony Matrix
const COLOR_PAIRINGS = {
  Black: ['White', 'Gray', 'Beige', 'Blue', 'Red', 'Black', 'Green'],
  White: ['Black', 'Blue', 'Navy', 'Beige', 'Gray', 'Green', 'Brown', 'Red'],
  Gray: ['Black', 'White', 'Navy', 'Blue', 'Beige', 'Red'],
  Beige: ['White', 'Black', 'Navy', 'Blue', 'Brown', 'Green'],
  Navy: ['White', 'Beige', 'Gray', 'Blue', 'Brown'],
  Blue: ['White', 'Black', 'Beige', 'Gray', 'Brown', 'Navy'],
  Green: ['Black', 'White', 'Beige', 'Brown', 'Blue'],
  Red: ['Black', 'White', 'Navy', 'Gray', 'Beige'],
  Brown: ['White', 'Beige', 'Blue', 'Green', 'Navy']
};

// ==========================================
// 3. DATA LAYER (SUPABASE + LOCAL FALLBACK)
// ==========================================
async function fetchClosetItems() {
  const statusEl = document.getElementById('db-status-text');

  if (supabaseClient) {
    statusEl.textContent = 'Connected to Supabase Cloud Database';
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
      statusEl.textContent = 'Supabase error — using local backup';
    }
  } else {
    statusEl.textContent = 'Running in Local Demo Mode (Add Supabase keys in app.js for cloud sync)';
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
    const { data, error } = await supabaseClient
      .from('closet_items')
      .insert([{ name: newItem.name, category: newItem.category, color: newItem.color }])
      .select();

    if (!error && data && data[0]) {
      closetItems.unshift(data[0]);
      renderCloset();
      return;
    }
  }

  // Local fallback
  const itemWithId = { ...newItem, id: Date.now().toString() };
  closetItems.unshift(itemWithId);
  localStorage.setItem('virtual_closet_items', JSON.stringify(closetItems));
  renderCloset();
}

async function removeClosetItem(id) {
  if (supabaseClient) {
    await supabaseClient.from('closet_items').delete().eq('id', id);
  }

  closetItems = closetItems.filter((item) => String(item.id) !== String(id));
  localStorage.setItem('virtual_closet_items', JSON.stringify(closetItems));
  renderCloset();
}

// ==========================================
// 4. STYLING & OUTFIT ENGINE
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

  // Build up to 3 complete outfit formulas based on what the user is buying
  for (let i = 0; i < 3; i++) {
    const pieces = [`🆕 ${targetItem.name} (${targetItem.color})`];

    if (targetItem.category === 'Top') {
      if (bottoms[i % bottoms.length]) pieces.push(`👖 ${bottoms[i % bottoms.length].name}`);
      if (shoes[i % shoes.length]) pieces.push(`👟 ${shoes[i % shoes.length].name}`);
      if (outerwear[0] && i === 1) pieces.push(`🧥 ${outerwear[0].name}`);
    } else if (targetItem.category === 'Bottom') {
      if (tops[i % tops.length]) pieces.push(`👕 ${tops[i % tops.length].name}`);
      if (shoes[i % shoes.length]) pieces.push(`👟 ${shoes[i % shoes.length].name}`);
      if (outerwear[0] && i === 1) pieces.push(`🧥 ${outerwear[0].name}`);
    } else if (targetItem.category === 'Outerwear') {
      if (tops[i % tops.length]) pieces.push(`👕 ${tops[i % tops.length].name}`);
      if (bottoms[i % bottoms.length]) pieces.push(`👖 ${bottoms[i % bottoms.length].name}`);
      if (shoes[i % shoes.length]) pieces.push(`👟 ${shoes[i % shoes.length].name}`);
    } else if (targetItem.category === 'Shoes') {
      if (tops[i % tops.length]) pieces.push(`👕 ${tops[i % tops.length].name}`);
      if (bottoms[i % bottoms.length]) pieces.push(`👖 ${bottoms[i % bottoms.length].name}`);
    } else {
      if (tops[i % tops.length]) pieces.push(`👕 ${tops[i % tops.length].name}`);
      if (bottoms[i % bottoms.length]) pieces.push(`👖 ${bottoms[i % bottoms.length].name}`);
    }

    if (pieces.length > 1) {
      outfits.push({
        label: `Look #${outfits.length + 1} — ${selectedStyle} Vibe`,
        pieces
      });
    }
  }

  // Calculate versatility score
  const score = Math.min(98, Math.max(68, 70 + matchingItems.length * 5));

  const styleNotes = {
    Minimalist: `Keep the silhouette clean. Let the ${targetItem.color.toLowerCase()} tone anchor the look without competing patterns.`,
    Streetwear: `Play with proportions—pair this ${targetItem.color.toLowerCase()} piece with relaxed fits and your cleanest sneakers.`,
    'Smart Casual': `Balance structured and relaxed textures. Tucking in your top or adding a layer elevates this effortlessly.`,
    'Classic Chic': `Stick to intentional color blocking and refined footwear so the ${targetItem.name} looks tailored.`
  };

  return {
    score,
    advice: styleNotes[selectedStyle] || styleNotes.Minimalist,
    outfits
  };
}

// ==========================================
// 5. UI RENDERING & EVENT LISTENERS
// ==========================================
function renderCloset() {
  const grid = document.getElementById('closet-grid');
  const countEl = document.getElementById('closet-count');

  countEl.textContent = `${closetItems.length} item${closetItems.length === 1 ? '' : 's'} saved`;

  const filtered =
    currentFilter === 'All'
      ? closetItems
      : closetItems.filter((item) => item.category === currentFilter);

  if (filtered.length === 0) {
    grid.innerHTML = `<p style="grid-column: 1/-1; color: var(--text-muted); font-size: 0.9rem; text-align: center; padding: 24px 0;">No items in this category yet. Tap "+ Add Item" above.</p>`;
    return;
  }

  grid.innerHTML = filtered
    .map(
      (item) => `
      <div class="closet-item-card">
        <div>
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span class="item-tag">${item.category}</span>
            <button class="delete-btn" onclick="removeClosetItem('${item.id}')" title="Remove item">&times;</button>
          </div>
          <div class="item-title">${item.name}</div>
        </div>
        <div class="item-meta">
          <span>
            <span class="color-dot" style="background:${COLOR_SWATCHES[item.color] || '#ccc'}"></span>
            ${item.color}
          </span>
        </div>
      </div>
    `
    )
    .join('');
}

document.addEventListener('DOMContentLoaded', () => {
  // Initialize Style Persona UI
  document.getElementById('active-style-badge').textContent = selectedStyle;
  document.querySelectorAll('.persona-card').forEach((card) => {
    card.classList.toggle('active', card.dataset.style === selectedStyle);
    card.addEventListener('click', () => {
      selectedStyle = card.dataset.style;
      localStorage.setItem('user_style_persona', selectedStyle);
      document.getElementById('active-style-badge').textContent = selectedStyle;
      document.querySelectorAll('.persona-card').forEach((c) => c.classList.remove('active'));
      card.classList.add('active');
    });
  });

  // Bottom Tab Navigation
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      document.querySelectorAll('.nav-item').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      document.querySelectorAll('.tab-panel').forEach((panel) => panel.classList.remove('active'));
      document.getElementById(targetId).classList.add('active');
    });
  });

  // Toggle Add Closet Form
  const addForm = document.getElementById('add-closet-form');
  document.getElementById('toggle-add-btn').addEventListener('click', () => {
    addForm.classList.toggle('hidden');
  });
  document.getElementById('cancel-add-btn').addEventListener('click', () => {
    addForm.classList.add('hidden');
  });

  // Handle Add Closet Form Submit
  addForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('item-name').value.trim();
    const category = document.getElementById('item-category').value;
    const color = document.getElementById('item-color').value;

    if (!name) return;
    await createClosetItem({ name, category, color });
    addForm.reset();
    addForm.classList.add('hidden');
  });

  // Closet Category Filters
  document.querySelectorAll('.filter-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      currentFilter = chip.dataset.filter;
      document.querySelectorAll('.filter-chip').forEach((c) => c.classList.remove('active'));
      chip.classList.add('active');
      renderCloset();
    });
  });

  // Handle Style Matcher Form Submit
  document.getElementById('matcher-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('buy-name').value.trim();
    const category = document.getElementById('buy-category').value;
    const color = document.getElementById('buy-color').value;

    const result = generateOutfitMatches({ name, category, color });

    document.getElementById('match-score').textContent = `${result.score}% Closet Match`;
    document.getElementById('styling-advice').textContent = result.advice;

    const outfitContainer = document.getElementById('outfit-cards');
    if (result.outfits.length === 0) {
      outfitContainer.innerHTML = `<p style="font-size:0.9rem; color:var(--text-muted);">Add a few more tops, bottoms, or shoes in "My Closet" to build full outfits!</p>`;
    } else {
      outfitContainer.innerHTML = result.outfits
        .map(
          (outfit) => `
          <div class="outfit-card">
            <div class="outfit-title">${outfit.label}</div>
            <ul class="outfit-pieces">
              ${outfit.pieces.map((p) => `<li>${p}</li>`).join('')}
            </ul>
          </div>
        `
        )
        .join('');
    }

    document.getElementById('match-results').classList.remove('hidden');
  });

  // Load initial data
  fetchClosetItems();
});
