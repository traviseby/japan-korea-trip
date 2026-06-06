/* Plan Mode — Trip Planning Logic
 * Runs alongside Travel Mode. Stores data in localStorage.tripPlan.
 * When trip is generated, syncs to Coda and unlocks Travel Mode.
 */
(function(){
  'use strict';

  // ─── Plan Mode State ──────────────────────────────────────────────────────
  const PLAN_STORAGE_KEY = 'tripPlan';
  
  function getPlanData() {
    try {
      return JSON.parse(localStorage.getItem(PLAN_STORAGE_KEY)) || initPlanData();
    } catch {
      return initPlanData();
    }
  }

  function initPlanData() {
    const data = {
      survey: null,
      surveyComplete: false,
      activities: [],
      hotels: [],
      flights: [],
      generated: false,
      prompt: '',
      itinerary: null
    };
    savePlanData(data);
    return data;
  }

  function savePlanData(data) {
    try {
      localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save plan data:', e);
      // If quota exceeded, try to clear old data
      if (e.name === 'QuotaExceededError') {
        console.warn('localStorage quota exceeded');
      }
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  
  function formatDate(dateString, options = { month: 'short', day: 'numeric' }) {
    if (!dateString) return '';
    try {
      return new Date(dateString + 'T00:00:00').toLocaleDateString('en-US', options);
    } catch {
      return dateString;
    }
  }
  
  function formatTime(timeString) {
    if (!timeString) return '--:--';
    return timeString;
  }
  
  function showToast(message, duration = 3000) {
    // Simple toast notification
    const existingToast = $('.plan-toast');
    if (existingToast) existingToast.remove();
    
    const toast = el('div', { 
      class: 'plan-toast',
      style: {
        position: 'fixed',
        bottom: 'calc(var(--sab, 0px) + 80px)',
        left: '50%',
        transform: 'translateX(-50%)',
        padding: '12px 20px',
        background: 'var(--surface-2)',
        border: '1px solid var(--border-strong)',
        borderRadius: 'var(--r)',
        fontSize: '14px',
        color: 'var(--fg)',
        zIndex: '10000',
        opacity: '0',
        transition: 'opacity 0.2s ease',
        maxWidth: 'calc(100% - 40px)',
        textAlign: 'center'
      }
    }, message);
    
    document.body.appendChild(toast);
    
    // Fade in
    setTimeout(() => {
      toast.style.opacity = '1';
    }, 10);
    
    // Fade out and remove
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 200);
    }, duration);
  }
  
  function validateDates(checkIn, checkOut, fieldName = 'dates') {
    if (!checkIn || !checkOut) {
      showToast(`Please select both ${fieldName}`);
      return false;
    }
    
    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    
    if (checkOutDate <= checkInDate) {
      showToast('Check-out must be after check-in');
      return false;
    }
    
    return true;
  }
  
  function el(tag, attrs, ...children){
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs){
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'style' && typeof v === 'object') {
        for (const sk in v) e.style[sk] = v[sk];
      }
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    }
    for (const c of children.flat()){
      if (c == null || c === false) continue;
      e.appendChild(c.nodeType ? c : document.createTextNode(c));
    }
    return e;
  }

  // ─── Survey Questions ─────────────────────────────────────────────────────
  const SURVEY_QUESTIONS = [
    {
      id: 'destinations',
      title: 'Where are you going?',
      type: 'destination-search',
      skippable: false,
      hint: 'Start typing a city or country'
    },
    {
      id: 'travelers',
      title: 'Who\'s coming?',
      type: 'travelers',
      skippable: true,
      options: [
        { id: 'solo', emoji: '🧍', label: 'Just me' },
        { id: 'couple', emoji: '👫', label: 'Couple' },
        { id: 'family', emoji: '👨‍👩‍👧', label: 'Family' },
        { id: 'friends', emoji: '👯', label: 'Friends group' }
      ]
    },
    {
      id: 'vibes',
      title: 'What\'s your vibe?',
      subtitle: 'On vacation, I like to...',
      type: 'multi-select',
      max: 2,
      skippable: true,
      options: [
        { id: 'pack-it-in', emoji: '🏃', label: 'Pack it all in', subtitle: 'See everything even if my feet fall off' },
        { id: 'slow-down', emoji: '🛏️', label: 'Slow it way down', subtitle: 'Sleep in, wander, stumble onto things' },
        { id: 'eat', emoji: '🍽️', label: 'Eat my way through it', subtitle: 'Restaurants are the itinerary' },
        { id: 'culture', emoji: '🏛️', label: 'Go deep on culture', subtitle: 'Museums, history, local life' },
        { id: 'outdoors', emoji: '🌿', label: 'Get outside', subtitle: 'Hikes, beaches, fresh air' },
        { id: 'party', emoji: '🎉', label: 'Make it a party', subtitle: 'Bars, shows, nightlife' },
        { id: 'relax', emoji: '💆', label: 'Actually relax', subtitle: 'Spas, pools, doing nothing' },
        { id: 'treat', emoji: '🛍️', label: 'Treat myself', subtitle: 'Shopping, great hotels, nice dinners' }
      ]
    },
    {
      id: 'duration',
      title: 'How long is the trip?',
      type: 'duration-slider',
      skippable: true,
      min: 1,
      max: 21
    },
    {
      id: 'when',
      title: 'When are you going?',
      type: 'when',
      skippable: true
    },
    {
      id: 'interests',
      title: 'What are you into?',
      type: 'interests-chips',
      skippable: true
    },
    {
      id: 'budget',
      title: 'How do you like to spend?',
      type: 'budget',
      skippable: true,
      options: [
        { id: 'budget', emoji: '🪙', label: 'On the cheap', subtitle: 'Budget-friendly all the way' },
        { id: 'moderate', emoji: '💳', label: 'Middle of the road', subtitle: 'Comfortable without going crazy' },
        { id: 'splurge', emoji: '💎', label: 'Splurge-worthy', subtitle: 'Nice hotels, great meals, worth it' },
        { id: 'luxury', emoji: '🚀', label: 'Money is no object', subtitle: 'The best of everything, please' }
      ]
    },
    {
      id: 'notes',
      title: 'Anything else we should know?',
      type: 'free-text',
      skippable: true,
      placeholder: 'Dietary restrictions, accessibility needs, a special occasion...'
    }
  ];

  // ─── Survey UI ────────────────────────────────────────────────────────────
  let currentQuestionIndex = 0;
  let surveyAnswers = {};

  function showSurvey() {
    const planData = getPlanData();
    
    console.log('showSurvey called', { surveyComplete: planData.surveyComplete });
    
    // Don't show if already completed (but allow manual restart)
    if (planData.surveyComplete) {
      console.log('Survey already completed, resetting...');
      // Reset survey to allow retaking it
      planData.surveyComplete = false;
      planData.survey = null;
      savePlanData(planData);
    }

    // Initialize answers from saved data if available
    surveyAnswers = planData.survey || {};
    currentQuestionIndex = 0;

    // Render survey in About tab
    renderAboutTab();
  }

  function renderAboutTab() {
    const aboutScreen = $('#plan-about');
    if (!aboutScreen) return;

    const planData = getPlanData();
    
    if (planData.surveyComplete) {
      // Show about content
      renderAboutContent(aboutScreen);
    } else {
      // Show survey
      renderSurveyQuestion(aboutScreen);
    }
  }

  function renderAboutContent(container) {
    const planData = getPlanData();
    const survey = planData.survey || {};
    const hotels = planData.hotels || [];
    const flights = planData.flights || [];
    const activities = planData.activities || [];
    
    container.innerHTML = '';
    
    // Filter bar (tab header)
    const filterBar = el('div', { class: 'filter-bar' },
      el('div', { class: 'filter-label' }, 'About')
    );
    
    // Helper function to create info cards
    const infoCard = (title, value) => {
      if (!value) return null;
      return el('div', { class: 'offline-card', style: { marginBottom: '12px' } },
        el('div', { style: { fontSize: '12px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--fg-mute)', marginBottom: '6px' } }, title),
        el('div', { style: { color: 'var(--fg)', fontSize: '15px' } }, value)
      );
    };
    
    // Scrollable content
    const scroll = el('div', { class: 'scroll', style: { padding: 'var(--pad)' } },
      el('h1', { 
        style: { fontFamily: 'var(--serif)', fontSize: '32px', fontWeight: '400', lineHeight: '1.15', marginBottom: '8px' }
      }, survey.destinations && survey.destinations[0] ? survey.destinations[0] : 'Your Trip'),
      
      // Trip stats
      el('div', { 
        style: { 
          display: 'grid', 
          gridTemplateColumns: 'repeat(3, 1fr)', 
          gap: '12px', 
          marginBottom: '32px',
          marginTop: '24px'
        } 
      },
        el('div', { 
          style: { 
            padding: '16px', 
            background: 'var(--surface)', 
            borderRadius: 'var(--r)', 
            textAlign: 'center' 
          } 
        },
          el('div', { style: { fontSize: '28px', fontWeight: '600', color: 'var(--fg)', fontFamily: 'var(--serif)' } }, hotels.length),
          el('div', { style: { fontSize: '12px', color: 'var(--fg-mute)', marginTop: '4px' } }, 'Hotels')
        ),
        el('div', { 
          style: { 
            padding: '16px', 
            background: 'var(--surface)', 
            borderRadius: 'var(--r)', 
            textAlign: 'center' 
          } 
        },
          el('div', { style: { fontSize: '28px', fontWeight: '600', color: 'var(--fg)', fontFamily: 'var(--serif)' } }, flights.length),
          el('div', { style: { fontSize: '12px', color: 'var(--fg-mute)', marginTop: '4px' } }, 'Flights')
        ),
        el('div', { 
          style: { 
            padding: '16px', 
            background: 'var(--surface)', 
            borderRadius: 'var(--r)', 
            textAlign: 'center' 
          } 
        },
          el('div', { style: { fontSize: '28px', fontWeight: '600', color: 'var(--fg)', fontFamily: 'var(--serif)' } }, activities.length),
          el('div', { style: { fontSize: '12px', color: 'var(--fg-mute)', marginTop: '4px' } }, 'Activities')
        )
      ),
      
      // Survey details section header
      el('div', { 
        style: { 
          fontSize: '13px', 
          fontWeight: '600', 
          textTransform: 'uppercase', 
          letterSpacing: '0.05em',
          color: 'var(--fg-mid)', 
          marginBottom: '16px',
          marginTop: '8px'
        } 
      }, 'Trip Details'),
      
      // Survey answers
      infoCard('Travelers', survey.travelers ? 
        SURVEY_QUESTIONS.find(q => q.id === 'travelers')?.options.find(o => o.id === survey.travelers)?.label : null),
      
      infoCard('Duration', survey.duration ? 
        `${survey.duration} ${survey.duration === 1 ? 'day' : 'days'}` : null),
      
      infoCard('Budget', survey.budget ? 
        SURVEY_QUESTIONS.find(q => q.id === 'budget')?.options.find(o => o.id === survey.budget)?.label : null),
      
      infoCard('Vibes', survey.vibes && survey.vibes.length > 0 ?
        survey.vibes.map(v => 
          SURVEY_QUESTIONS.find(q => q.id === 'vibes')?.options.find(o => o.id === v)?.label
        ).filter(Boolean).join(', ') : null),
      
      infoCard('Notes', survey.notes || null),
      
      // Retake survey button
      el('button', {
        class: 'oc-btn',
        style: { width: '100%', marginTop: '24px', padding: '14px' },
        onclick: () => {
          const planData = getPlanData();
          planData.surveyComplete = false;
          savePlanData(planData);
          renderAboutTab();
        }
      }, 'Edit Trip Details')
    );
    
    container.appendChild(filterBar);
    container.appendChild(scroll);
  }

  function renderSurveyQuestion(container) {
    const question = SURVEY_QUESTIONS[currentQuestionIndex];
    const isFirst = currentQuestionIndex === 0;
    const isLast = currentQuestionIndex === SURVEY_QUESTIONS.length - 1;
    const progress = Math.round(((currentQuestionIndex + 1) / SURVEY_QUESTIONS.length) * 100);

    container.innerHTML = '';
    container.style.setProperty('--progress', `${progress}%`);
    
    // Progress bar
    const progressBar = el('div', { class: 'survey-progress' });

    // Back button
    const backBtn = !isFirst ? el('button', { 
      class: 'survey-back',
      onclick: () => {
        currentQuestionIndex--;
        renderSurveyQuestion(container);
      }
    }, '← Back') : null;

    // Question card
    const card = el('div', { class: 'survey-card' },
      el('h1', { class: 'survey-title' }, question.title),
      question.subtitle ? el('p', { class: 'survey-subtitle' }, question.subtitle) : null,
      buildQuestionInput(question)
    );

    // Actions
    const actions = el('div', { class: 'survey-actions' },
      question.skippable ? el('button', { 
        class: 'survey-skip',
        onclick: () => nextQuestion(container)
      }, 'Skip') : null,
      el('button', { 
        class: 'survey-next',
        onclick: () => nextQuestion(container)
      }, isLast ? 'Build my trip →' : 'Next')
    );

    container.appendChild(progressBar);
    if (backBtn) container.appendChild(backBtn);
    container.appendChild(card);
    container.appendChild(actions);
  }

  function buildQuestionInput(question) {
    const container = el('div', { class: 'survey-input' });
    
    switch (question.type) {
      case 'destination-search':
        container.appendChild(el('input', {
          type: 'text',
          class: 'survey-text-input',
          placeholder: question.hint,
          value: surveyAnswers.destinations?.[0] || '',
          oninput: (e) => {
            if (!surveyAnswers.destinations) surveyAnswers.destinations = [];
            surveyAnswers.destinations[0] = e.target.value;
          }
        }));
        // TODO: Add autocomplete + multi-destination support
        break;

      case 'travelers':
      case 'budget':
        question.options.forEach(opt => {
          const card = el('button', {
            class: 'survey-option-card' + (surveyAnswers[question.id] === opt.id ? ' selected' : ''),
            onclick: () => {
              surveyAnswers[question.id] = opt.id;
              renderSurveyQuestion();
            }
          },
            el('div', { class: 'option-emoji' }, opt.emoji),
            el('div', { class: 'option-content' },
              el('div', { class: 'option-label' }, opt.label),
              opt.subtitle ? el('div', { class: 'option-subtitle' }, opt.subtitle) : null
            )
          );
          container.appendChild(card);
        });
        break;

      case 'multi-select':
        question.options.forEach(opt => {
          const selected = (surveyAnswers[question.id] || []).includes(opt.id);
          const card = el('button', {
            class: 'survey-option-card small' + (selected ? ' selected' : ''),
            onclick: () => {
              if (!surveyAnswers[question.id]) surveyAnswers[question.id] = [];
              const arr = surveyAnswers[question.id];
              const idx = arr.indexOf(opt.id);
              if (idx >= 0) {
                arr.splice(idx, 1);
              } else if (arr.length < question.max) {
                arr.push(opt.id);
              }
              renderSurveyQuestion();
            }
          },
            el('div', { class: 'option-emoji' }, opt.emoji),
            el('div', { class: 'option-content' },
              el('div', { class: 'option-label' }, opt.label),
              opt.subtitle ? el('div', { class: 'option-subtitle' }, opt.subtitle) : null
            )
          );
          container.appendChild(card);
        });
        if (question.max) {
          const selected = (surveyAnswers[question.id] || []).length;
          container.appendChild(el('div', { class: 'selection-count' }, 
            `${selected} of ${question.max} selected`
          ));
        }
        break;

      case 'duration-slider':
        const days = surveyAnswers[question.id] || 7;
        container.appendChild(
          el('div', { class: 'duration-display' }, days === 1 ? '1 day' : `${days} days`)
        );
        container.appendChild(el('input', {
          type: 'range',
          min: question.min,
          max: question.max,
          value: days,
          class: 'survey-slider',
          oninput: (e) => {
            surveyAnswers[question.id] = parseInt(e.target.value);
            renderSurveyQuestion();
          }
        }));
        // TODO: Add "Or pick exact dates" option
        break;

      case 'free-text':
        container.appendChild(el('textarea', {
          class: 'survey-textarea',
          placeholder: question.placeholder,
          value: surveyAnswers[question.id] || '',
          oninput: (e) => {
            surveyAnswers[question.id] = e.target.value;
          }
        }));
        break;

      default:
        container.appendChild(el('div', null, `TODO: ${question.type}`));
    }

    return container;
  }

  function nextQuestion(container) {
    // Save current answer
    const planData = getPlanData();
    planData.survey = surveyAnswers;
    savePlanData(planData);

    // Check if we're at the end
    if (currentQuestionIndex === SURVEY_QUESTIONS.length - 1) {
      completeSurvey();
      return;
    }

    // Move to next question
    currentQuestionIndex++;
    renderSurveyQuestion(container);
  }

  function completeSurvey() {
    const planData = getPlanData();
    planData.survey = surveyAnswers;
    planData.surveyComplete = true;
    savePlanData(planData);
    
    console.log('Survey complete!', surveyAnswers);
    
    // Re-render About tab to show about content
    renderAboutTab();
  }

  // ─── Plan Mode Tab Switching ──────────────────────────────────────────────
  function switchPlanTab(tabId) {
    // Hide all plan screens
    $$('.plan-screen').forEach(screen => {
      screen.classList.remove('active');
    });
    
    // Show the target screen
    const target = $(`#plan-${tabId}`);
    if (target) {
      target.classList.add('active');
    }
    
    // Update tab bar buttons
    $$('.plan-tabbar button').forEach(btn => {
      btn.classList.remove('active');
      if (btn.dataset.planTab === tabId) {
        btn.classList.add('active');
      }
    });
  }

  // ─── Hotels Tab ───────────────────────────────────────────────────────────
  function renderHotelsTab() {
    const hotelsScreen = $('#plan-hotels');
    if (!hotelsScreen) return;

    const planData = getPlanData();
    const hotels = planData.hotels || [];

    hotelsScreen.innerHTML = '';
    
    // Filter bar with add button
    const filterBar = el('div', { class: 'filter-bar' },
      el('div', { class: 'filter-label' }, 'Hotels'),
      el('button', {
        class: 'filter-btn',
        onclick: () => showAddHotelForm()
      }, '+ Add')
    );
    
    // Scrollable content
    const scroll = el('div', { 
      class: 'scroll',
      style: { padding: 'var(--pad)' }
    });

    if (hotels.length === 0) {
      scroll.appendChild(el('div', {
        style: { 
          textAlign: 'center', 
          padding: '60px 20px', 
          color: 'var(--fg-mid)' 
        }
      }, 
        el('div', { style: { fontSize: '48px', marginBottom: '16px' } }, '🏨'),
        el('div', { style: { marginBottom: '8px' } }, 'No hotels yet'),
        el('div', { style: { fontSize: '14px', color: 'var(--fg-mute)' } }, 
          'Tap + Add to book your stay'
        )
      ));
    } else {
      // Sort hotels by check-in date
      const sorted = [...hotels].sort((a, b) => 
        new Date(a.checkIn) - new Date(b.checkIn)
      );
      
      sorted.forEach(hotel => {
        scroll.appendChild(buildHotelCard(hotel));
      });
    }
    
    hotelsScreen.appendChild(filterBar);
    hotelsScreen.appendChild(scroll);
  }

  function buildHotelCard(hotel) {
    const checkIn = new Date(hotel.checkIn);
    const checkOut = new Date(hotel.checkOut);
    const nights = Math.ceil((checkOut - checkIn) / (1000 * 60 * 60 * 24));
    
    return el('div', { 
      class: 'offline-card',
      style: { marginBottom: '12px' }
    },
      el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' } },
        el('div', { style: { flex: '1' } },
          el('div', { class: 'oc-title' }, hotel.name),
          el('div', { style: { color: 'var(--fg-mid)', fontSize: '14px', marginTop: '4px' } },
            hotel.city || ''
          ),
          el('div', { style: { color: 'var(--fg-mute)', fontSize: '13px', marginTop: '8px' } },
            `${checkIn.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} → ${checkOut.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${nights} night${nights !== 1 ? 's' : ''}`
          ),
          hotel.roomType ? el('div', { style: { color: 'var(--fg-mute)', fontSize: '13px', marginTop: '4px' } },
            hotel.roomType
          ) : null
        ),
        el('div', { style: { display: 'flex', gap: '8px' } },
          el('button', {
            class: 'oc-btn',
            style: { padding: '8px 12px', fontSize: '13px' },
            onclick: () => showAddHotelForm(hotel)
          }, 'Edit'),
          el('button', {
            class: 'oc-btn',
            style: { padding: '8px 12px', fontSize: '13px', background: 'var(--p-critical)', color: 'var(--fg)' },
            onclick: () => {
              if (confirm(`Delete ${hotel.name}?`)) {
                deleteHotel(hotel.id);
              }
            }
          }, 'Delete')
        )
      )
    );
  }

  function showAddHotelForm(existingHotel = null) {
    const hotelsScreen = $('#plan-hotels');
    if (!hotelsScreen) return;

    const isEdit = !!existingHotel;
    const hotel = existingHotel || {
      id: Date.now().toString(),
      name: '',
      city: '',
      checkIn: '',
      checkOut: '',
      roomType: '',
      address: '',
      notes: ''
    };

    hotelsScreen.innerHTML = '';
    
    // Filter bar with back button
    const filterBar = el('div', { class: 'filter-bar' },
      el('button', {
        class: 'filter-btn',
        onclick: () => renderHotelsTab()
      }, '← Back'),
      el('div', { class: 'filter-label' }, isEdit ? 'Edit Hotel' : 'Add Hotel')
    );
    
    // Form
    const form = el('div', { 
      class: 'scroll',
      style: { padding: 'var(--pad)' }
    },
      // Hotel Name
      el('div', { style: { marginBottom: '20px' } },
        el('label', { style: { display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' } }, 'Hotel Name'),
        el('input', {
          type: 'text',
          id: 'hotel-name',
          class: 'survey-text-input',
          value: hotel.name,
          placeholder: 'The Grand Hotel'
        })
      ),
      
      // City
      el('div', { style: { marginBottom: '20px' } },
        el('label', { style: { display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' } }, 'City'),
        el('input', {
          type: 'text',
          id: 'hotel-city',
          class: 'survey-text-input',
          value: hotel.city,
          placeholder: 'Tokyo'
        })
      ),
      
      // Dates
      el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' } },
        el('div', {},
          el('label', { style: { display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' } }, 'Check-in'),
          el('input', {
            type: 'date',
            id: 'hotel-checkin',
            class: 'survey-text-input',
            value: hotel.checkIn
          })
        ),
        el('div', {},
          el('label', { style: { display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' } }, 'Check-out'),
          el('input', {
            type: 'date',
            id: 'hotel-checkout',
            class: 'survey-text-input',
            value: hotel.checkOut
          })
        )
      ),
      
      // Room Type
      el('div', { style: { marginBottom: '20px' } },
        el('label', { style: { display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' } }, 'Room Type (optional)'),
        el('input', {
          type: 'text',
          id: 'hotel-roomtype',
          class: 'survey-text-input',
          value: hotel.roomType,
          placeholder: 'Deluxe Double Room'
        })
      ),
      
      // Address
      el('div', { style: { marginBottom: '20px' } },
        el('label', { style: { display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' } }, 'Address (optional)'),
        el('input', {
          type: 'text',
          id: 'hotel-address',
          class: 'survey-text-input',
          value: hotel.address,
          placeholder: '123 Main Street'
        })
      ),
      
      // Notes
      el('div', { style: { marginBottom: '20px' } },
        el('label', { style: { display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' } }, 'Notes (optional)'),
        el('textarea', {
          id: 'hotel-notes',
          class: 'survey-textarea',
          value: hotel.notes,
          placeholder: 'Confirmation number, special requests, etc.'
        })
      ),
      
      // Save button
      el('button', {
        class: 'oc-btn',
        style: { width: '100%', padding: '16px', fontSize: '16px', fontWeight: '600' },
        onclick: () => {
          const newHotel = {
            id: hotel.id,
            name: $('#hotel-name').value.trim(),
            city: $('#hotel-city').value.trim(),
            checkIn: $('#hotel-checkin').value,
            checkOut: $('#hotel-checkout').value,
            roomType: $('#hotel-roomtype').value.trim(),
            address: $('#hotel-address').value.trim(),
            notes: $('#hotel-notes').value.trim()
          };
          
          if (!newHotel.name) {
            showToast('Please enter a hotel name');
            $('#hotel-name').focus();
            return;
          }
          if (!validateDates(newHotel.checkIn, newHotel.checkOut, 'check-in and check-out dates')) {
            return;
          }
          
          saveHotel(newHotel);
          showToast(`Hotel ${isEdit ? 'updated' : 'added'} successfully`);
          setTimeout(() => renderHotelsTab(), 500);
        }
      }, isEdit ? 'Save Changes' : 'Add Hotel')
    );
    
    hotelsScreen.appendChild(filterBar);
    hotelsScreen.appendChild(form);
  }

  function saveHotel(hotel) {
    const planData = getPlanData();
    const hotels = planData.hotels || [];
    
    const existingIndex = hotels.findIndex(h => h.id === hotel.id);
    if (existingIndex >= 0) {
      hotels[existingIndex] = hotel;
    } else {
      hotels.push(hotel);
    }
    
    planData.hotels = hotels;
    savePlanData(planData);
  }

  function deleteHotel(hotelId) {
    const planData = getPlanData();
    planData.hotels = (planData.hotels || []).filter(h => h.id !== hotelId);
    savePlanData(planData);
    renderHotelsTab();
  }

  // ─── Flights Tab ──────────────────────────────────────────────────────────
  function renderFlightsTab() {
    const flightsScreen = $('#plan-flights');
    if (!flightsScreen) return;

    const planData = getPlanData();
    const flights = planData.flights || [];

    flightsScreen.innerHTML = '';
    
    // Filter bar with add button
    const filterBar = el('div', { class: 'filter-bar' },
      el('div', { class: 'filter-label' }, 'Flights'),
      el('button', {
        class: 'filter-btn',
        onclick: () => showAddFlightForm()
      }, '+ Add')
    );
    
    // Scrollable content
    const scroll = el('div', { 
      class: 'scroll',
      style: { padding: 'var(--pad)' }
    });

    if (flights.length === 0) {
      scroll.appendChild(el('div', {
        style: { 
          textAlign: 'center', 
          padding: '60px 20px', 
          color: 'var(--fg-mid)' 
        }
      }, 
        el('div', { style: { fontSize: '48px', marginBottom: '16px' } }, '✈️'),
        el('div', { style: { marginBottom: '8px' } }, 'No flights yet'),
        el('div', { style: { fontSize: '14px', color: 'var(--fg-mute)' } }, 
          'Tap + Add to book your flight'
        )
      ));
    } else {
      // Group flights: outbound vs return
      const sorted = [...flights].sort((a, b) => 
        new Date(a.departureDate + 'T' + a.departureTime) - 
        new Date(b.departureDate + 'T' + b.departureTime)
      );
      
      // Section header for outbound
      if (sorted.length > 0) {
        scroll.appendChild(el('div', { 
          style: { 
            fontSize: '12px', 
            fontWeight: '600', 
            textTransform: 'uppercase', 
            letterSpacing: '0.05em',
            color: 'var(--fg-mute)', 
            marginBottom: '12px',
            marginTop: '8px'
          } 
        }, 'All Flights'));
      }
      
      sorted.forEach(flight => {
        scroll.appendChild(buildFlightCard(flight));
      });
    }
    
    flightsScreen.appendChild(filterBar);
    flightsScreen.appendChild(scroll);
  }

  function buildFlightCard(flight) {
    const depDate = new Date(flight.departureDate + 'T' + (flight.departureTime || '00:00'));
    const arrDate = new Date(flight.arrivalDate + 'T' + (flight.arrivalTime || '00:00'));
    
    return el('div', { 
      class: 'offline-card',
      style: { marginBottom: '12px' }
    },
      el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' } },
        el('div', { style: { flex: '1' } },
          el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' } },
            el('div', { class: 'oc-title' }, flight.airline),
            flight.flightNumber ? el('div', { 
              style: { 
                fontSize: '13px', 
                color: 'var(--fg-mute)', 
                padding: '2px 8px', 
                background: 'var(--surface-2)', 
                borderRadius: '4px' 
              } 
            }, flight.flightNumber) : null
          ),
          el('div', { style: { color: 'var(--fg-mid)', fontSize: '14px', marginTop: '8px' } },
            `${flight.departureAirport} → ${flight.arrivalAirport}`
          ),
          el('div', { style: { color: 'var(--fg-mute)', fontSize: '13px', marginTop: '4px' } },
            `${depDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${flight.departureTime || '--:--'} → ${arrDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${flight.arrivalTime || '--:--'}`
          )
        ),
        el('div', { style: { display: 'flex', gap: '8px' } },
          el('button', {
            class: 'oc-btn',
            style: { padding: '8px 12px', fontSize: '13px' },
            onclick: () => showAddFlightForm(flight)
          }, 'Edit'),
          el('button', {
            class: 'oc-btn',
            style: { padding: '8px 12px', fontSize: '13px', background: 'var(--p-critical)', color: 'var(--fg)' },
            onclick: () => {
              if (confirm(`Delete ${flight.airline} ${flight.flightNumber}?`)) {
                deleteFlight(flight.id);
              }
            }
          }, 'Delete')
        )
      )
    );
  }

  function showAddFlightForm(existingFlight = null) {
    const flightsScreen = $('#plan-flights');
    if (!flightsScreen) return;

    const isEdit = !!existingFlight;
    const flight = existingFlight || {
      id: Date.now().toString(),
      airline: '',
      flightNumber: '',
      departureAirport: '',
      arrivalAirport: '',
      departureDate: '',
      departureTime: '',
      arrivalDate: '',
      arrivalTime: '',
      confirmationNumber: '',
      notes: ''
    };

    flightsScreen.innerHTML = '';
    
    // Filter bar with back button
    const filterBar = el('div', { class: 'filter-bar' },
      el('button', {
        class: 'filter-btn',
        onclick: () => renderFlightsTab()
      }, '← Back'),
      el('div', { class: 'filter-label' }, isEdit ? 'Edit Flight' : 'Add Flight')
    );
    
    // Form
    const form = el('div', { 
      class: 'scroll',
      style: { padding: 'var(--pad)' }
    },
      // Airline
      el('div', { style: { marginBottom: '20px' } },
        el('label', { style: { display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' } }, 'Airline'),
        el('input', {
          type: 'text',
          id: 'flight-airline',
          class: 'survey-text-input',
          value: flight.airline,
          placeholder: 'United Airlines'
        })
      ),
      
      // Flight Number
      el('div', { style: { marginBottom: '20px' } },
        el('label', { style: { display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' } }, 'Flight Number (optional)'),
        el('input', {
          type: 'text',
          id: 'flight-number',
          class: 'survey-text-input',
          value: flight.flightNumber,
          placeholder: 'UA 123'
        })
      ),
      
      // Departure
      el('div', { style: { marginBottom: '12px', fontSize: '13px', fontWeight: '600', textTransform: 'uppercase', color: 'var(--fg-mid)', letterSpacing: '0.05em' } }, 'Departure'),
      el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' } },
        el('div', {},
          el('label', { style: { display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' } }, 'Airport'),
          el('input', {
            type: 'text',
            id: 'flight-dep-airport',
            class: 'survey-text-input',
            value: flight.departureAirport,
            placeholder: 'JFK'
          })
        ),
        el('div', {},
          el('label', { style: { display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' } }, 'Date'),
          el('input', {
            type: 'date',
            id: 'flight-dep-date',
            class: 'survey-text-input',
            value: flight.departureDate
          })
        )
      ),
      el('div', { style: { marginBottom: '20px' } },
        el('label', { style: { display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' } }, 'Time'),
        el('input', {
          type: 'time',
          id: 'flight-dep-time',
          class: 'survey-text-input',
          value: flight.departureTime
        })
      ),
      
      // Arrival
      el('div', { style: { marginBottom: '12px', fontSize: '13px', fontWeight: '600', textTransform: 'uppercase', color: 'var(--fg-mid)', letterSpacing: '0.05em' } }, 'Arrival'),
      el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' } },
        el('div', {},
          el('label', { style: { display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' } }, 'Airport'),
          el('input', {
            type: 'text',
            id: 'flight-arr-airport',
            class: 'survey-text-input',
            value: flight.arrivalAirport,
            placeholder: 'NRT'
          })
        ),
        el('div', {},
          el('label', { style: { display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' } }, 'Date'),
          el('input', {
            type: 'date',
            id: 'flight-arr-date',
            class: 'survey-text-input',
            value: flight.arrivalDate
          })
        )
      ),
      el('div', { style: { marginBottom: '20px' } },
        el('label', { style: { display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' } }, 'Time'),
        el('input', {
          type: 'time',
          id: 'flight-arr-time',
          class: 'survey-text-input',
          value: flight.arrivalTime
        })
      ),
      
      // Confirmation Number
      el('div', { style: { marginBottom: '20px' } },
        el('label', { style: { display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' } }, 'Confirmation Number (optional)'),
        el('input', {
          type: 'text',
          id: 'flight-confirmation',
          class: 'survey-text-input',
          value: flight.confirmationNumber,
          placeholder: 'ABC123'
        })
      ),
      
      // Notes
      el('div', { style: { marginBottom: '20px' } },
        el('label', { style: { display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' } }, 'Notes (optional)'),
        el('textarea', {
          id: 'flight-notes',
          class: 'survey-textarea',
          value: flight.notes,
          placeholder: 'Seat preferences, meal requests, etc.'
        })
      ),
      
      // Save button
      el('button', {
        class: 'oc-btn',
        style: { width: '100%', padding: '16px', fontSize: '16px', fontWeight: '600' },
        onclick: () => {
          const newFlight = {
            id: flight.id,
            airline: $('#flight-airline').value.trim(),
            flightNumber: $('#flight-number').value.trim(),
            departureAirport: $('#flight-dep-airport').value.trim(),
            arrivalAirport: $('#flight-arr-airport').value.trim(),
            departureDate: $('#flight-dep-date').value,
            departureTime: $('#flight-dep-time').value,
            arrivalDate: $('#flight-arr-date').value,
            arrivalTime: $('#flight-arr-time').value,
            confirmationNumber: $('#flight-confirmation').value.trim(),
            notes: $('#flight-notes').value.trim()
          };
          
          if (!newFlight.airline) {
            showToast('Please enter an airline');
            $('#flight-airline').focus();
            return;
          }
          if (!newFlight.departureAirport) {
            showToast('Please enter departure airport');
            $('#flight-dep-airport').focus();
            return;
          }
          if (!newFlight.arrivalAirport) {
            showToast('Please enter arrival airport');
            $('#flight-arr-airport').focus();
            return;
          }
          if (!validateDates(newFlight.departureDate, newFlight.arrivalDate, 'departure and arrival dates')) {
            return;
          }
          
          saveFlight(newFlight);
          showToast(`Flight ${isEdit ? 'updated' : 'added'} successfully`);
          setTimeout(() => renderFlightsTab(), 500);
        }
      }, isEdit ? 'Save Changes' : 'Add Flight')
    );
    
    flightsScreen.appendChild(filterBar);
    flightsScreen.appendChild(form);
  }

  function saveFlight(flight) {
    const planData = getPlanData();
    const flights = planData.flights || [];
    
    const existingIndex = flights.findIndex(f => f.id === flight.id);
    if (existingIndex >= 0) {
      flights[existingIndex] = flight;
    } else {
      flights.push(flight);
    }
    
    planData.flights = flights;
    savePlanData(planData);
  }

  function deleteFlight(flightId) {
    const planData = getPlanData();
    planData.flights = (planData.flights || []).filter(f => f.id !== flightId);
    savePlanData(planData);
    renderFlightsTab();
  }

  // ─── Activities Tab ───────────────────────────────────────────────────────
  function renderActivitiesTab() {
    const activitiesScreen = $('#plan-activities');
    if (!activitiesScreen) return;

    const planData = getPlanData();
    const activities = planData.activities || [];

    activitiesScreen.innerHTML = '';
    
    // Filter bar with add button
    const filterBar = el('div', { class: 'filter-bar' },
      el('div', { class: 'filter-label' }, 'Activities'),
      el('button', {
        class: 'filter-btn',
        onclick: () => showAddActivityForm()
      }, '+ Add')
    );
    
    // Scrollable content
    const scroll = el('div', { 
      class: 'scroll',
      style: { padding: 'var(--pad)' }
    });

    if (activities.length === 0) {
      scroll.appendChild(el('div', {
        style: { 
          textAlign: 'center', 
          padding: '60px 20px', 
          color: 'var(--fg-mid)' 
        }
      }, 
        el('div', { style: { fontSize: '48px', marginBottom: '16px' } }, '🎯'),
        el('div', { style: { marginBottom: '8px' } }, 'No activities yet'),
        el('div', { style: { fontSize: '14px', color: 'var(--fg-mute)' } }, 
          'Tap + Add to plan your itinerary'
        )
      ));
    } else {
      // Group by date
      const byDate = {};
      activities.forEach(activity => {
        const dateKey = activity.date || 'No date';
        if (!byDate[dateKey]) byDate[dateKey] = [];
        byDate[dateKey].push(activity);
      });
      
      // Sort dates
      const sortedDates = Object.keys(byDate).sort((a, b) => {
        if (a === 'No date') return 1;
        if (b === 'No date') return -1;
        return new Date(a) - new Date(b);
      });
      
      sortedDates.forEach(dateKey => {
        const dateActivities = byDate[dateKey];
        
        // Date header
        let dateLabel = dateKey;
        if (dateKey !== 'No date') {
          const date = new Date(dateKey + 'T00:00:00');
          dateLabel = date.toLocaleDateString('en-US', { 
            weekday: 'short',
            month: 'short', 
            day: 'numeric',
            year: 'numeric'
          });
        }
        
        scroll.appendChild(el('div', { 
          style: { 
            fontSize: '13px', 
            fontWeight: '600', 
            textTransform: 'uppercase', 
            letterSpacing: '0.05em',
            color: 'var(--fg-mid)', 
            marginBottom: '12px',
            marginTop: dateKey === sortedDates[0] ? '0' : '24px',
            paddingTop: dateKey === sortedDates[0] ? '0' : '12px',
            borderTop: dateKey === sortedDates[0] ? 'none' : '1px solid var(--border)'
          } 
        }, dateLabel));
        
        // Sort activities by time
        const sorted = [...dateActivities].sort((a, b) => {
          if (!a.time && !b.time) return 0;
          if (!a.time) return 1;
          if (!b.time) return -1;
          return a.time.localeCompare(b.time);
        });
        
        sorted.forEach(activity => {
          scroll.appendChild(buildActivityCard(activity));
        });
      });
    }
    
    activitiesScreen.appendChild(filterBar);
    activitiesScreen.appendChild(scroll);
  }

  function buildActivityCard(activity) {
    return el('div', { 
      class: 'offline-card',
      style: { marginBottom: '12px' }
    },
      el('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' } },
        el('div', { style: { flex: '1' } },
          el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' } },
            activity.time ? el('div', { 
              style: { 
                fontSize: '13px', 
                color: 'var(--fg-mute)', 
                fontWeight: '600',
                fontVariantNumeric: 'tabular-nums'
              } 
            }, activity.time) : null,
            el('div', { class: 'oc-title', style: { flex: '1' } }, activity.name)
          ),
          activity.location ? el('div', { style: { color: 'var(--fg-mid)', fontSize: '14px', marginTop: '6px' } },
            `📍 ${activity.location}`
          ) : null,
          activity.notes ? el('div', { style: { color: 'var(--fg-mute)', fontSize: '13px', marginTop: '6px', lineHeight: '1.5' } },
            activity.notes
          ) : null
        ),
        el('div', { style: { display: 'flex', gap: '8px', flexShrink: '0', marginLeft: '12px' } },
          el('button', {
            class: 'oc-btn',
            style: { padding: '8px 12px', fontSize: '13px' },
            onclick: () => showAddActivityForm(activity)
          }, 'Edit'),
          el('button', {
            class: 'oc-btn',
            style: { padding: '8px 12px', fontSize: '13px', background: 'var(--p-critical)', color: 'var(--fg)' },
            onclick: () => {
              if (confirm(`Delete ${activity.name}?`)) {
                deleteActivity(activity.id);
              }
            }
          }, 'Delete')
        )
      )
    );
  }

  function showAddActivityForm(existingActivity = null) {
    const activitiesScreen = $('#plan-activities');
    if (!activitiesScreen) return;

    const isEdit = !!existingActivity;
    const activity = existingActivity || {
      id: Date.now().toString(),
      name: '',
      date: '',
      time: '',
      location: '',
      notes: ''
    };

    activitiesScreen.innerHTML = '';
    
    // Filter bar with back button
    const filterBar = el('div', { class: 'filter-bar' },
      el('button', {
        class: 'filter-btn',
        onclick: () => renderActivitiesTab()
      }, '← Back'),
      el('div', { class: 'filter-label' }, isEdit ? 'Edit Activity' : 'Add Activity')
    );
    
    // Form
    const form = el('div', { 
      class: 'scroll',
      style: { padding: 'var(--pad)' }
    },
      // Activity Name
      el('div', { style: { marginBottom: '20px' } },
        el('label', { style: { display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' } }, 'Activity Name'),
        el('input', {
          type: 'text',
          id: 'activity-name',
          class: 'survey-text-input',
          value: activity.name,
          placeholder: 'Visit Senso-ji Temple'
        })
      ),
      
      // Date and Time
      el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' } },
        el('div', {},
          el('label', { style: { display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' } }, 'Date'),
          el('input', {
            type: 'date',
            id: 'activity-date',
            class: 'survey-text-input',
            value: activity.date
          })
        ),
        el('div', {},
          el('label', { style: { display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' } }, 'Time (optional)'),
          el('input', {
            type: 'time',
            id: 'activity-time',
            class: 'survey-text-input',
            value: activity.time
          })
        )
      ),
      
      // Location
      el('div', { style: { marginBottom: '20px' } },
        el('label', { style: { display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' } }, 'Location (optional)'),
        el('input', {
          type: 'text',
          id: 'activity-location',
          class: 'survey-text-input',
          value: activity.location,
          placeholder: 'Asakusa, Tokyo'
        })
      ),
      
      // Notes
      el('div', { style: { marginBottom: '20px' } },
        el('label', { style: { display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' } }, 'Notes (optional)'),
        el('textarea', {
          id: 'activity-notes',
          class: 'survey-textarea',
          value: activity.notes,
          placeholder: 'Details, reservations, tips...'
        })
      ),
      
      // Save button
      el('button', {
        class: 'oc-btn',
        style: { width: '100%', padding: '16px', fontSize: '16px', fontWeight: '600' },
        onclick: () => {
          const newActivity = {
            id: activity.id,
            name: $('#activity-name').value.trim(),
            date: $('#activity-date').value,
            time: $('#activity-time').value,
            location: $('#activity-location').value.trim(),
            notes: $('#activity-notes').value.trim()
          };
          
          if (!newActivity.name) {
            showToast('Please enter an activity name');
            $('#activity-name').focus();
            return;
          }
          if (!newActivity.date) {
            showToast('Please select a date');
            $('#activity-date').focus();
            return;
          }
          
          saveActivity(newActivity);
          showToast(`Activity ${isEdit ? 'updated' : 'added'} successfully`);
          setTimeout(() => renderActivitiesTab(), 500);
        }
      }, isEdit ? 'Save Changes' : 'Add Activity')
    );
    
    activitiesScreen.appendChild(filterBar);
    activitiesScreen.appendChild(form);
  }

  function saveActivity(activity) {
    const planData = getPlanData();
    const activities = planData.activities || [];
    
    const existingIndex = activities.findIndex(a => a.id === activity.id);
    if (existingIndex >= 0) {
      activities[existingIndex] = activity;
    } else {
      activities.push(activity);
    }
    
    planData.activities = activities;
    savePlanData(planData);
  }

  function deleteActivity(activityId) {
    const planData = getPlanData();
    planData.activities = (planData.activities || []).filter(a => a.id !== activityId);
    savePlanData(planData);
    renderActivitiesTab();
  }

  // ─── Generate Tab ─────────────────────────────────────────────────────────
  function renderGenerateTab() {
    const generateScreen = $('#plan-generate');
    if (!generateScreen) return;

    const planData = getPlanData();
    const hasData = (planData.hotels?.length || 0) + (planData.flights?.length || 0) + (planData.activities?.length || 0) > 0;

    generateScreen.innerHTML = '';
    
    // Filter bar
    const filterBar = el('div', { class: 'filter-bar' },
      el('div', { class: 'filter-label' }, 'Generate')
    );
    
    // Scrollable content
    const scroll = el('div', { 
      class: 'scroll',
      style: { padding: 'var(--pad)' }
    });

    if (!planData.surveyComplete) {
      // Show message to complete survey first
      scroll.appendChild(el('div', {
        style: { 
          textAlign: 'center', 
          padding: '60px 20px', 
          color: 'var(--fg-mid)' 
        }
      }, 
        el('div', { style: { fontSize: '48px', marginBottom: '16px' } }, '📋'),
        el('div', { style: { marginBottom: '12px', fontSize: '18px', fontWeight: '500' } }, 'Complete your trip details first'),
        el('div', { style: { fontSize: '14px', color: 'var(--fg-mute)', marginBottom: '24px' } }, 
          'Head to the About tab to answer a few questions about your trip'
        ),
        el('button', {
          class: 'oc-btn',
          style: { padding: '14px 32px' },
          onclick: () => window.PlanMode?.switchPlanTab('about')
        }, 'Go to About')
      ));
    } else {
      // Show generate interface
      scroll.appendChild(
        el('div', { style: { marginBottom: '32px' } },
          el('h1', { 
            style: { fontFamily: 'var(--serif)', fontSize: '32px', fontWeight: '400', lineHeight: '1.15', marginBottom: '12px' }
          }, 'AI Itinerary Generator'),
          el('p', { 
            style: { fontSize: '15px', color: 'var(--fg-mid)', lineHeight: '1.6' }
          }, 'Let AI create a detailed itinerary based on your trip details and preferences.')
        )
      );

      // Current trip summary
      scroll.appendChild(
        el('div', { 
          class: 'offline-card',
          style: { marginBottom: '24px', background: 'var(--surface-2)' }
        },
          el('div', { style: { fontSize: '13px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--fg-mute)', marginBottom: '12px' } }, 'Current Trip'),
          el('div', { style: { fontSize: '15px', color: 'var(--fg)', marginBottom: '4px' } }, 
            planData.survey.destinations?.[0] || 'Destination'
          ),
          el('div', { style: { fontSize: '14px', color: 'var(--fg-mid)' } }, 
            `${planData.survey.duration || 0} days · ${planData.survey.travelers || 'solo'}`
          )
        )
      );

      // Additional preferences
      scroll.appendChild(
        el('div', { style: { marginBottom: '24px' } },
          el('label', { style: { display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500' } }, 
            'Additional Preferences (optional)'
          ),
          el('textarea', {
            id: 'generate-preferences',
            class: 'survey-textarea',
            placeholder: 'E.g., "I want to visit the best ramen shops" or "Include kid-friendly activities"...',
            style: { minHeight: '100px' }
          })
        )
      );

      // Generate button
      const generateBtn = el('button', {
        class: 'oc-btn',
        style: { 
          width: '100%', 
          padding: '18px', 
          fontSize: '16px', 
          fontWeight: '600',
          background: 'var(--fg)',
          color: 'var(--bg)'
        },
        onclick: () => {
          alert('AI generation coming soon! For now, manually add your hotels, flights, and activities in their respective tabs.');
        }
      }, '✨ Generate Itinerary');

      scroll.appendChild(generateBtn);

      // Info card
      if (hasData) {
        scroll.appendChild(
          el('div', { 
            class: 'offline-card',
            style: { 
              marginTop: '24px', 
              background: 'var(--surface)',
              border: '1px solid var(--border-strong)'
            }
          },
            el('div', { style: { fontSize: '14px', color: 'var(--fg-mid)', lineHeight: '1.6' } }, 
              '⚠️ Generating a new itinerary will replace your existing hotels, flights, and activities. Consider exporting your current plan first.'
            )
          )
        );
      }

      // How it works
      scroll.appendChild(
        el('div', { style: { marginTop: '32px', paddingTop: '24px', borderTop: '1px solid var(--border)' } },
          el('div', { style: { fontSize: '13px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--fg-mid)', marginBottom: '16px' } }, 
            'How it Works'
          ),
          el('div', { style: { fontSize: '14px', color: 'var(--fg-mute)', lineHeight: '1.7' } },
            '1. AI analyzes your trip details and preferences\n\n2. Creates a day-by-day itinerary with activities\n\n3. Suggests hotels and books flights\n\n4. You can edit and refine everything afterwards'
          )
        )
      );
    }
    
    generateScreen.appendChild(filterBar);
    generateScreen.appendChild(scroll);
  }

  // ─── Keyboard Shortcuts ──────────────────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    // Only handle shortcuts in plan mode
    const currentMode = localStorage.getItem('jk26.appMode') || 'travel';
    if (currentMode !== 'plan') return;
    
    // Don't interfere with form inputs
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      // Escape to blur input
      if (e.key === 'Escape') {
        e.target.blur();
      }
      return;
    }
    
    // Global shortcuts
    if (e.key === 'Escape') {
      // Close any open forms by going back to tab view
      const activeTab = $('.plan-screen.active');
      if (activeTab) {
        const tabId = activeTab.id.replace('plan-', '');
        if (tabId === 'about') renderAboutTab();
        else if (tabId === 'hotels') renderHotelsTab();
        else if (tabId === 'flights') renderFlightsTab();
        else if (tabId === 'activities') renderActivitiesTab();
        else if (tabId === 'generate') renderGenerateTab();
      }
    }
  });

  // ─── Initialization ───────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    const planData = getPlanData();
    
    // Set up Plan mode tab bar event listeners
    $$('.plan-tabbar button').forEach(btn => {
      btn.addEventListener('click', () => {
        const tabId = btn.dataset.planTab;
        if (tabId) {
          switchPlanTab(tabId);
          // Render tab content when switching
          if (tabId === 'about') {
            renderAboutTab();
          } else if (tabId === 'hotels') {
            renderHotelsTab();
          } else if (tabId === 'flights') {
            renderFlightsTab();
          } else if (tabId === 'activities') {
            renderActivitiesTab();
          } else if (tabId === 'generate') {
            renderGenerateTab();
          } else if (tabId === 'todo') {
            if (window.TravelMode && window.TravelMode.renderTodoTab) {
              window.TravelMode.renderTodoTab();
            }
          }
        }
      });
    });
    
    // Render About tab on init if in plan mode
    const currentMode = localStorage.getItem('jk26.appMode') || 'travel';
    if (currentMode === 'plan') {
      setTimeout(() => renderAboutTab(), 100);
    }
  });

  // Export for testing
  window.PlanMode = {
    showSurvey,
    switchPlanTab,
    renderAboutTab,
    renderHotelsTab,
    renderFlightsTab,
    renderActivitiesTab,
    renderGenerateTab,
    getPlanData,
    savePlanData
  };

})();
