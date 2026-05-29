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
    localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(data));
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  
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

    const overlay = el('div', { 
      id: 'plan-survey-overlay',
      class: 'plan-survey-overlay show'
    });

    console.log('Appending survey overlay', overlay);
    document.body.appendChild(overlay);
    renderSurveyQuestion();
  }

  function closeSurvey() {
    const overlay = $('#plan-survey-overlay');
    if (!overlay) return;
    
    overlay.classList.remove('show');
    setTimeout(() => overlay.remove(), 300);
  }

  function renderSurveyQuestion() {
    const overlay = $('#plan-survey-overlay');
    if (!overlay) return;

    const question = SURVEY_QUESTIONS[currentQuestionIndex];
    const isFirst = currentQuestionIndex === 0;
    const isLast = currentQuestionIndex === SURVEY_QUESTIONS.length - 1;
    const progress = Math.round(((currentQuestionIndex + 1) / SURVEY_QUESTIONS.length) * 100);

    overlay.innerHTML = '';
    overlay.style.setProperty('--progress', `${progress}%`);
    
    // Progress bar
    const progressBar = el('div', { class: 'survey-progress' });

    // Back button
    const backBtn = !isFirst ? el('button', { 
      class: 'survey-back',
      onclick: () => {
        currentQuestionIndex--;
        renderSurveyQuestion();
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
        onclick: () => nextQuestion()
      }, 'Skip') : null,
      el('button', { 
        class: 'survey-next',
        onclick: () => nextQuestion()
      }, isLast ? 'Build my trip →' : 'Next')
    );

    overlay.appendChild(progressBar);
    if (backBtn) overlay.appendChild(backBtn);
    overlay.appendChild(card);
    overlay.appendChild(actions);
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

  function nextQuestion() {
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
    renderSurveyQuestion();
  }

  function completeSurvey() {
    const planData = getPlanData();
    planData.survey = surveyAnswers;
    planData.surveyComplete = true;
    savePlanData(planData);

    closeSurvey();
    
    // Navigate to About tab
    switchPlanTab('about');
    console.log('Survey complete!', surveyAnswers);
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

  // ─── Initialization ───────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    const planData = getPlanData();
    
    // Set up Plan mode tab bar event listeners
    $$('.plan-tabbar button').forEach(btn => {
      btn.addEventListener('click', () => {
        const tabId = btn.dataset.planTab;
        if (tabId) {
          switchPlanTab(tabId);
        }
      });
    });
    
    // Show survey on first launch in plan mode
    if (!planData.surveyComplete) {
      const currentMode = localStorage.getItem('jk26.appMode') || 'travel';
      if (currentMode === 'plan') {
        setTimeout(() => showSurvey(), 500);
      }
    }
  });

  // Export for testing
  window.PlanMode = {
    showSurvey,
    switchPlanTab,
    getPlanData,
    savePlanData
  };

})();
