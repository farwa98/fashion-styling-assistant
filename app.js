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
// 4. STYLING & OUTFIT RECOMMENDATION ENGINE
// ==========================================

function generateOutfitMatches(targetItem) {

    // --------------------------------------
    // 1. Helper Functions
    // --------------------------------------

    const normalize = (value) => {
        return String(value || '')
            .trim()
            .toLowerCase();
    };

    const itemKey = (item) => {
        return [
            normalize(item.name),
            normalize(item.category),
            normalize(item.color)
        ].join('|');
    };

    const escapeHTML = (value) => {
        return String(value).replace(
            /[&<>"']/g,
            (character) => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            })[character]
        );
    };


    // --------------------------------------
    // 2. Remove Duplicate Closet Items
    // --------------------------------------

    const uniqueCloset = [];
    const seenItems = new Set();

    for (const item of closetItems) {

        const key = itemKey(item);

        if (!seenItems.has(key)) {
            seenItems.add(key);
            uniqueCloset.push(item);
        }
    }


    // --------------------------------------
    // 3. Color Compatibility
    // --------------------------------------

    const neutralColors = [
        'black',
        'white',
        'gray',
        'beige',
        'navy',
        'brown'
    ];

    function getColorScore(color1, color2) {

        const first = normalize(color1);
        const second = normalize(color2);

        if (!first || !second) {
            return 50;
        }

        // Monochromatic outfits
        if (first === second) {
            return 95;
        }

        // Neutral color combinations
        if (
            neutralColors.includes(first) &&
            neutralColors.includes(second)
        ) {
            return 95;
        }

        // Check the existing color harmony matrix
        const firstKey = Object.keys(COLOR_PAIRINGS)
            .find((key) => normalize(key) === first);

        const secondKey = Object.keys(COLOR_PAIRINGS)
            .find((key) => normalize(key) === second);

        const firstMatches = (
            COLOR_PAIRINGS[firstKey] || []
        ).map(normalize);

        const secondMatches = (
            COLOR_PAIRINGS[secondKey] || []
        ).map(normalize);

        if (
            firstMatches.includes(second) ||
            secondMatches.includes(first)
        ) {
            return 90;
        }

        if (
            neutralColors.includes(first) ||
            neutralColors.includes(second)
        ) {
            return 75;
        }

        return 30;
    }


    // --------------------------------------
    // 4. Personal Style Compatibility
    // --------------------------------------

    const styleRules = {

        Minimalist: {
            preferred: [
                'plain',
                'basic',
                'white tee',
                'straight-leg',
                'tailored',
                'knit',
                'loafers',
                'crewneck',
                'classic',
                'ribbed'
            ],

            avoided: [
                'neon',
                'graphic',
                'distressed',
                'sequin'
            ]
        },

        Streetwear: {
            preferred: [
                'oversized',
                'hoodie',
                'sneaker',
                'cargo',
                'baggy',
                'graphic',
                'denim',
                'jeans',
                'bomber',
                'jogger',
                'combat boots'
            ],

            avoided: [
                'heels',
                'stiletto',
                'pumps',
                'formal'
            ]
        },

        'Smart Casual': {
            preferred: [
                'blazer',
                'button down',
                'button-down',
                'trousers',
                'loafers',
                'chinos',
                'cardigan',
                'knit',
                'dark denim'
            ],

            avoided: [
                'ripped',
                'jogger',
                'sweatpants'
            ]
        },

        'Classic Chic': {
            preferred: [
                'blazer',
                'trench',
                'tailored',
                'heels',
                'loafers',
                'silk',
                'trousers',
                'structured',
                'button down',
                'cashmere'
            ],

            avoided: [
                'distressed',
                'graphic',
                'jogger',
                'neon'
            ]
        }
    };

    const activeStyle =
        styleRules[selectedStyle] || styleRules.Minimalist;

    function getStyleScore(item) {

        const name = normalize(item.name);

        let score = 60;

        for (const keyword of activeStyle.preferred) {

            if (name.includes(keyword)) {
                score += 20;
            }
        }

        for (const keyword of activeStyle.avoided) {

            if (name.includes(keyword)) {
                score -= 35;
            }
        }

        return Math.max(0, Math.min(100, score));
    }


    // --------------------------------------
    // 5. Weather Compatibility
    // --------------------------------------

    const isCold =
        currentWeather.condition === 'cold';

    const isWarm =
        currentWeather.condition === 'warm';

    function getWeatherScore(item) {

        const name = normalize(item.name);

        const warmClothing = [
            'wool',
            'fur',
            'coat',
            'hoodie',
            'sweater',
            'turtleneck',
            'boots',
            'fleece',
            'thermal',
            'cashmere',
            'puffer'
        ];

        const lightClothing = [
            'linen',
            'shorts',
            'sandals',
            'tank top',
            'sleeveless',
            'crop top'
        ];

        const isWarmItem = warmClothing.some(
            (keyword) => name.includes(keyword)
        );

        const isLightItem = lightClothing.some(
            (keyword) => name.includes(keyword)
        );

        if (isCold) {

            if (isWarmItem) {
                return 95;
            }

            if (isLightItem) {
                return 30;
            }
        }

        if (isWarm) {

            if (isLightItem) {
                return 95;
            }

            if (isWarmItem) {
                return 25;
            }
        }

        return 70;
    }


    // --------------------------------------
    // 6. Organize Clothing by Category
    // --------------------------------------

    const targetCategory =
        normalize(targetItem.category);

    const requiredCategories = [
        'top',
        'bottom',
        'shoes'
    ].filter(
        (category) => category !== targetCategory
    );

    const categoryPools = {};
    const missingCategories = [];

    function getIndividualScore(item) {

        const colorScore = getColorScore(
            targetItem.color,
            item.color
        );

        const styleScore = getStyleScore(item);

        const weatherScore = getWeatherScore(item);

        return (
            colorScore * 0.50 +
            styleScore * 0.35 +
            weatherScore * 0.15
        );
    }

    for (const category of requiredCategories) {

        const items = uniqueCloset
            .filter(
                (item) =>
                    normalize(item.category) === category
            )
            .sort(
                (a, b) =>
                    getIndividualScore(b) -
                    getIndividualScore(a)
            );

        // Limit the pool to keep the website responsive
        categoryPools[category] = items.slice(0, 20);

        if (items.length === 0) {
            missingCategories.push(category);
        }
    }


    // --------------------------------------
    // 7. Handle Missing Wardrobe Categories
    // --------------------------------------

    if (missingCategories.length > 0) {

        return {
            score: 0,

            advice:
                'Your closet is missing items in these ' +
                'categories: ' +
                missingCategories.join(', ') +
                '. Add more clothing to generate ' +
                'complete outfits using items you own.',

            outfits: []
        };
    }


    // --------------------------------------
    // 8. Optional Outerwear for Cold Weather
    // --------------------------------------

    if (isCold && targetCategory !== 'outerwear') {

        const outerwear = uniqueCloset
            .filter(
                (item) =>
                    normalize(item.category) === 'outerwear'
            )
            .sort(
                (a, b) =>
                    getIndividualScore(b) -
                    getIndividualScore(a)
            );

        if (outerwear.length > 0) {

            categoryPools.outerwear =
                outerwear.slice(0, 5);
        }
    }


    // --------------------------------------
    // 9. Score an Entire Outfit
    // --------------------------------------

    function calculateOutfitScore(items) {

        const allItems = [
            targetItem,
            ...items
        ];

        let totalColorScore = 0;
        let colorPairs = 0;

        // Compare every clothing item with every other item
        for (let i = 0; i < allItems.length; i++) {

            for (
                let j = i + 1;
                j < allItems.length;
                j++
            ) {

                totalColorScore += getColorScore(
                    allItems[i].color,
                    allItems[j].color
                );

                colorPairs++;
            }
        }

        const colorScore = colorPairs > 0
            ? totalColorScore / colorPairs
            : 0;

        const styleScore = allItems.reduce(
            (total, item) =>
                total + getStyleScore(item),
            0
        ) / allItems.length;

        const weatherScore = allItems.reduce(
            (total, item) =>
                total + getWeatherScore(item),
            0
        ) / allItems.length;

        return Math.round(
            colorScore * 0.45 +
            styleScore * 0.40 +
            weatherScore * 0.15
        );
    }


    // --------------------------------------
    // 10. Generate Possible Outfit Combinations
    // --------------------------------------

    const candidates = [];

    const categories = Object.keys(categoryPools);

    function buildCombinations(index, currentItems) {

        // A complete combination has been created
        if (index === categories.length) {

            candidates.push({

                items: [...currentItems],

                score: calculateOutfitScore(
                    currentItems
                )
            });

            return;
        }

        const category = categories[index];

        for (const item of categoryPools[category]) {

            buildCombinations(
                index + 1,
                [...currentItems, item]
            );
        }
    }

    buildCombinations(0, []);


    // --------------------------------------
    // 11. Rank Outfits by Compatibility
    // --------------------------------------

    candidates.sort(
        (a, b) => b.score - a.score
    );

    // Avoid recommending very weak combinations
    const compatibleOutfits = candidates.filter(
        (outfit) => outfit.score >= 55
    );

    if (compatibleOutfits.length === 0) {

        return {
            score: candidates[0]?.score || 0,

            advice:
                'This item has limited compatibility ' +
                'with your current wardrobe and style. ' +
                'Consider another item or add more ' +
                'clothing options to your closet.',

            outfits: []
        };
    }


    // --------------------------------------
    // 12. Calculate Outfit Diversity
    // --------------------------------------

    function getOutfitDifference(outfit1, outfit2) {

        let difference = 0;

        for (const item of outfit1.items) {

            const matchingCategory = outfit2.items.find(
                (otherItem) =>
                    normalize(otherItem.category) ===
                    normalize(item.category)
            );

            if (
                !matchingCategory ||
                itemKey(item) !== itemKey(matchingCategory)
            ) {
                difference++;
            }
        }

        return difference;
    }


    // Check whether the main clothing pieces change
    function hasDifferentMainPiece(outfit1, outfit2) {

        return outfit1.items.some((item) => {

            const category = normalize(item.category);

            if (
                category !== 'top' &&
                category !== 'bottom' &&
                category !== 'outerwear'
            ) {
                return false;
            }

            const otherItem = outfit2.items.find(
                (piece) =>
                    normalize(piece.category) === category
            );

            return (
                !otherItem ||
                itemKey(item) !== itemKey(otherItem)
            );
        });
    }


    // --------------------------------------
    // 13. Select Three Genuinely Different Looks
    // --------------------------------------

    const selectedOutfits = [];

    // Always select the highest-scoring outfit first
    selectedOutfits.push(compatibleOutfits[0]);

    while (selectedOutfits.length < 3) {

        let bestCandidate = null;
        let bestRanking = -Infinity;

        for (const candidate of compatibleOutfits) {

            if (selectedOutfits.includes(candidate)) {
                continue;
            }

            // Each look must differ from every selected look
            const isDiverse = selectedOutfits.every(
                (existing) =>
                    getOutfitDifference(
                        candidate,
                        existing
                    ) >= 2 &&
                    hasDifferentMainPiece(
                        candidate,
                        existing
                    )
            );

            if (!isDiverse) {
                continue;
            }

            const minimumDifference = Math.min(
                ...selectedOutfits.map(
                    (existing) => getOutfitDifference(
                        candidate,
                        existing
                    )
                )
            );

            // Reward compatibility and outfit variety
            const ranking =
                candidate.score +
                minimumDifference * 5;

            if (ranking > bestRanking) {

                bestCandidate = candidate;
                bestRanking = ranking;
            }
        }

        // Do not force repetitive outfits
        if (!bestCandidate) {
            break;
        }

        selectedOutfits.push(bestCandidate);
    }


    // --------------------------------------
    // 14. Format Outfit Recommendations
    // --------------------------------------

    const categoryIcons = {
        top: '👕',
        bottom: '👖',
        shoes: '👟',
        outerwear: '🧥',
        accessory: '👜'
    };

    const outfits = selectedOutfits.map(
        (outfit, index) => {

            const pieces = [
                `🆕 ${escapeHTML(targetItem.name)} ` +
                `(${escapeHTML(targetItem.color)})`
            ];

            for (const item of outfit.items) {

                const category =
                    normalize(item.category);

                const icon =
                    categoryIcons[category] || '👗';

                pieces.push(
                    `${icon} ${escapeHTML(item.name)} ` +
                    `(${escapeHTML(item.color)})`
                );
            }

            return {

                label:
                    `Look #${index + 1} — ` +
                    `${escapeHTML(selectedStyle)} Vibe ` +
                    `(${outfit.score}% Match)`,

                pieces
            };
        }
    );


    // --------------------------------------
    // 15. Personalized Styling Advice
    // --------------------------------------

    const styleAdvice = {

        Minimalist:
            'Keep the look clean and balanced with ' +
            'neutral colors and simple silhouettes.',

        Streetwear:
            'Focus on relaxed silhouettes, layering, ' +
            'denim, and comfortable footwear.',

        'Smart Casual':
            'Combine structured clothing with relaxed ' +
            'everyday pieces for a polished look.',

        'Classic Chic':
            'Choose timeless pieces, refined footwear, ' +
            'and elegant color combinations.'
    };

    let advice =
        styleAdvice[selectedStyle] ||
        styleAdvice.Minimalist;

    const bestScore = selectedOutfits[0].score;

    if (bestScore >= 85) {

        advice +=
            ' This item pairs very well with ' +
            'your existing wardrobe.';

    } else if (bestScore >= 70) {

        advice +=
            ' This item has several good styling ' +
            'possibilities with your closet.';

    } else {

        advice +=
            ' This item has moderate compatibility ' +
            'with your current wardrobe.';
    }


    // --------------------------------------
    // 16. Weather-Based Advice
    // --------------------------------------

    if (
        isCold &&
        currentWeather.tempF !== null
    ) {

        advice +=
            ` Since it is ${currentWeather.tempF}°F ` +
            'outside, consider warm layers.';

        if (
            targetCategory !== 'outerwear' &&
            !categoryPools.outerwear
        ) {

            advice +=
                ' Your closet has no saved outerwear.';
        }

    } else if (
        isWarm &&
        currentWeather.tempF !== null
    ) {

        advice +=
            ` With temperatures around ` +
            `${currentWeather.tempF}°F, ` +
            'consider lightweight fabrics.';
    }


    // --------------------------------------
    // 17. Explain Limited Outfit Variety
    // --------------------------------------

    if (selectedOutfits.length < 3) {

        advice +=
            ` We found ${selectedOutfits.length} ` +
            'sufficiently different compatible ' +
            'look(s). Add more clothing items for ' +
            'greater outfit variety.';
    }


    // --------------------------------------
    // 18. Return Final Recommendations
    // --------------------------------------

    return {
        score: bestScore,
        advice: advice,
        outfits: outfits
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
