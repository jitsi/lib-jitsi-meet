export const $_ = (el, selector) => el.querySelector(`:scope ${selector}`);
export const $$_ = (el, selector) => [ ...el.querySelectorAll(`:scope ${selector}`) ];
export const attr = (el, key) => el.getAttribute(key);
