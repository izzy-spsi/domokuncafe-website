(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DomoSurveyLogic = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function toggleMulti(selected, option, options, maxChoices) {
    const current = selected.slice();
    if (option.exclusive) {
      if (current.length === 1 && current[0] === option.id) return [];
      return [option.id];
    }
    const kept = current.filter((id) => {
      const found = options.find((item) => item.id === id);
      return found && !found.exclusive;
    });
    if (kept.includes(option.id)) return kept.filter((id) => id !== option.id);
    if (maxChoices && kept.length >= maxChoices) {
      return { error: `Choose up to ${maxChoices}.`, value: kept };
    }
    return kept.concat(option.id);
  }

  return { toggleMulti };
});
