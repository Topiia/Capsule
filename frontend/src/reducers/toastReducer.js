export const TOAST_ACTIONS = {
  SHOW: "SHOW",
  HIDE: "HIDE",
  CLEAR: "CLEAR"
};

export const toastReducer = (state, action) => {
  switch (action.type) {
    case TOAST_ACTIONS.SHOW:
      return [...state, action.payload];
    case TOAST_ACTIONS.HIDE:
      return state.filter(toast => toast.id !== action.payload.id);
    case TOAST_ACTIONS.CLEAR:
      return [];
    default:
      return state;
  }
};
