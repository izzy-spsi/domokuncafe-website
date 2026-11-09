/* Hides the reservations banner after the guest dismisses it. The choice stays in this browser. */
(function () {
  var KEY = 'domo-reserve-banner-dismissed';
  try {
    if (localStorage.getItem(KEY) === '1') document.documentElement.classList.add('reserve-banner-dismissed');
  } catch (e) {}
  document.addEventListener('click', function (event) {
    var button = event.target.closest && event.target.closest('[data-reserve-dismiss]');
    if (!button) return;
    document.documentElement.classList.add('reserve-banner-dismissed');
    try { localStorage.setItem(KEY, '1'); } catch (err) {}
  });
})();
