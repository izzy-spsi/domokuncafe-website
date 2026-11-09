(function () {
  var booking = window.DomoBooking;
  var config = window.DOMO_RESERVATIONS;
  if (!booking || !config) return;

  var plan = booking.planBooking(config);
  var heading = document.querySelector('[data-booking-heading]');
  var lead = document.querySelector('[data-booking-lead]');
  var actions = document.querySelector('[data-booking-actions]');
  if (!heading || !lead || !actions) return;
  if (!plan.reservationsOpen && !plan.waitlistOpen) return;

  function actionLink(href, label, kind) {
    var link = document.createElement('a');
    link.className = kind === 'waitlist' ? 'button button--outline' : 'button';
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.dataset.booking = kind;
    link.appendChild(document.createTextNode(label + ' '));
    var suffix = document.createElement('span');
    suffix.className = 'rsv-newtab';
    suffix.textContent = plan.newTabSuffix;
    link.appendChild(suffix);
    return link;
  }

  if (plan.reservationsOpen) {
    heading.textContent = plan.heading;
    lead.textContent = plan.lead;
    actions.appendChild(actionLink(plan.reservationUrl, plan.reserveLabel, 'reservation'));
  }
  if (plan.waitlistOpen) {
    var note = document.createElement('p');
    note.className = 'rsv-note';
    note.textContent = plan.waitlistNote;
    actions.appendChild(note);
    actions.appendChild(actionLink(plan.waitlistUrl, plan.waitlistLabel, 'waitlist'));
  }
  actions.hidden = false;
})();
