const defaultSurvey = {
  title: 'Get to Know Our Domo Guests',
  intro: 'Get to Know Our Domo Guests! Tell us a little about yourself and what brought you here. Complete this short survey to receive {{current_reward}}. One response and one reward per party, per visit. No name, phone number, or email required.',
  schema: {
    steps: [
      { id: 'step_visit', title: 'About your visit', questionIds: ['q_live', 'q_party', 'q_first'] },
      { id: 'step_brought', title: 'What brought you here', questionIds: ['q_discovery', 'q_familiar', 'q_visit'] },
      { id: 'step_next', title: 'What you want next', questionIds: ['q_outing', 'q_excited'] }
    ],
    questions: [
      {
        id: 'q_live',
        type: 'location',
        reportKey: 'location',
        required: false,
        label: 'Where do you live?'
      },
      {
        id: 'q_party',
        type: 'integer',
        reportKey: 'party_size',
        required: true,
        label: 'How many people are in your party today, including you?',
        min: 1,
        max: 99
      },
      {
        id: 'q_first',
        type: 'single',
        reportKey: 'first_visit',
        required: true,
        label: 'Is this your first visit to Domo Cafe?',
        options: [
          { id: 'first_time', label: 'Yes, this is my first visit' },
          { id: 'returning', label: 'No, I have visited before' }
        ]
      },
      {
        id: 'q_discovery',
        type: 'single',
        reportKey: 'discovery',
        required: true,
        label: 'Where did you first hear about Domo Cafe?',
        options: [
          { id: 'tiktok', label: 'TikTok' },
          { id: 'instagram', label: 'Instagram' },
          { id: 'facebook', label: 'Facebook' },
          { id: 'google', label: 'Google Search or Google Maps' },
          { id: 'friend_family', label: 'Friend or family' },
          { id: 'walking_driving', label: 'Walking or driving by' },
          { id: 'event', label: 'Event or convention' },
          { id: 'news', label: 'News, article, or blog' },
          { id: 'other', label: 'Other', allowsText: true },
          { id: 'dont_remember', label: 'I do not remember' }
        ]
      },
      {
        id: 'q_familiar',
        type: 'single',
        reportKey: 'familiarity',
        required: true,
        label: 'Before you heard about Domo Cafe, were you familiar with Domo the character?',
        options: [
          { id: 'fan', label: 'Yes, I was already a fan' },
          { id: 'recognized', label: 'I recognized Domo but was not a big fan' },
          { id: 'new', label: 'No, Domo was new to me' },
          { id: 'not_sure', label: 'Not sure' }
        ]
      },
      {
        id: 'q_visit',
        type: 'single',
        reportKey: 'visit_type',
        required: true,
        label: 'Which best describes your visit today?',
        options: [
          { id: 'main_destination', label: 'Domo Cafe was our main destination' },
          { id: 'several_stops', label: 'Domo Cafe was one of several planned stops' },
          { id: 'nearby', label: 'We were already nearby and decided to come in' },
          { id: 'other', label: 'Other', allowsText: true }
        ]
      },
      {
        id: 'q_outing',
        type: 'multi',
        reportKey: 'outing',
        required: true,
        label: 'What else are you visiting on this outing?',
        options: [
          { id: 'knotts', label: "Knott's Berry Farm" },
          { id: 'buena_park_downtown', label: 'Other shops or attractions at Buena Park Downtown mall' },
          { id: 'disneyland', label: 'Disneyland' },
          { id: 'friends_family', label: 'Friends or family nearby' },
          { id: 'another_place', label: 'Another place', allowsText: true },
          { id: 'no_other', label: 'No other stops', exclusive: true },
          { id: 'undecided', label: 'We have not decided yet', exclusive: true }
        ]
      },
      {
        id: 'q_excited',
        type: 'multi',
        reportKey: 'interests',
        required: true,
        maxChoices: 3,
        label: 'What would you be most excited to see at Domo Cafe?',
        options: [
          { id: 'merch', label: 'New or exclusive merchandise' },
          { id: 'food', label: 'New food items' },
          { id: 'drinks', label: 'New drinks' },
          { id: 'desserts', label: 'New desserts' },
          { id: 'domo_visits', label: 'Visits or photo opportunities with Domo' },
          { id: 'something_else', label: 'Something else', allowsText: true },
          { id: 'no_preference', label: 'No preference', exclusive: true }
        ]
      }
    ]
  }
};

module.exports = { defaultSurvey };
