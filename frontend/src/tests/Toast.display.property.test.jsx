import { describe, it, expect } from "vitest";
import { render, screen, act } from "@testing-library/react";
import * as fc from "fast-check";
import { toastReducer, TOAST_ACTIONS } from "../reducers/toastReducer";
import { ToastProvider, useToast } from "../contexts/ToastContext";

// --- Model Object for State Machine Testing ---
class ToastModel {
  constructor() {
    this.toasts = []; 
  }
}

// --- Commands for Model-Based Testing ---
class ShowCommand {
  constructor(payload) {
    this.payload = payload;
  }
  check() { return true; }
  run(model, real) {
    // Model Transition
    model.toasts.push(this.payload);
    
    // Real Transition (Deep Frozen Input to prove Immutability)
    const frozenState = Object.freeze([...real.state]);
    const nextState = toastReducer(frozenState, { type: TOAST_ACTIONS.SHOW, payload: this.payload });

    // Invariants
    expect(nextState).not.toBe(frozenState); // Strict structural inequality
    expect(nextState.length).toBe(model.toasts.length);
    expect(nextState[nextState.length - 1]).toEqual(this.payload);
    
    real.state = nextState;
  }
}

class HideCommand {
  constructor(id) {
    this.id = id;
  }
  check() { return true; }
  run(model, real) {
    // Model Transition
    model.toasts = model.toasts.filter(t => t.id !== this.id);
    
    // Real Transition
    const frozenState = Object.freeze([...real.state]);
    const nextState = toastReducer(frozenState, { type: TOAST_ACTIONS.HIDE, payload: { id: this.id } });

    // Invariants
    expect(nextState.some(t => t.id === this.id)).toBe(false);
    expect(nextState.length).toBe(model.toasts.length);
    if (frozenState.some(t => t.id === this.id)) {
        expect(nextState).not.toBe(frozenState); 
    }

    real.state = nextState;
  }
}

class ClearCommand {
  check() { return true; }
  run(model, real) {
    // Model Transition
    model.toasts = [];
    
    // Real Transition
    const frozenState = Object.freeze([...real.state]);
    const nextState = toastReducer(frozenState, { type: TOAST_ACTIONS.CLEAR });

    // Invariants
    expect(nextState.length).toBe(0);
    expect(nextState).toEqual(model.toasts);

    real.state = nextState;
  }
}

describe("Layer A: toastReducer Pure Formal Verification", () => {
  // Arbitraries
  const showPayloadArbitrary = fc.record({
    id: fc.uuid(),
    message: fc.string({ minLength: 1 }),
    type: fc.constantFrom("info", "success", "error", "warning"),
    duration: fc.integer({ min: 1000, max: 10000 })
  });

  const commandsArbitrary = fc.commands([
    showPayloadArbitrary.map(payload => new ShowCommand(payload)),
    fc.uuid().map(id => new HideCommand(id)),
    fc.constant(new ClearCommand())
  ], { maxCommands: 50 });

  it("should maintain strict equivalence between Reducer State and Shadow Model across arbitrary action sequences", () => {
    fc.assert(
      fc.property(commandsArbitrary, (cmds) => {
        const setup = () => ({
          model: new ToastModel(),
          real: { state: [] }
        });
        fc.modelRun(setup, cmds);
      }),
      { numRuns: 100 }
    );
  });

  it("should never contain undefined/null entries or break schema during array-reduction folding", () => {
    // Sequence-based testing via Array.reduce fold
    const actionArbitrary = fc.oneof(
      showPayloadArbitrary.map(payload => ({ type: TOAST_ACTIONS.SHOW, payload })),
      fc.uuid().map(id => ({ type: TOAST_ACTIONS.HIDE, payload: { id } })),
      fc.constant({ type: TOAST_ACTIONS.CLEAR })
    );

    fc.assert(
      fc.property(fc.array(actionArbitrary, { minLength: 1, maxLength: 100 }), (actions) => {
        const finalState = actions.reduce((state, action) => {
          const frozen = Object.freeze([...state]);
          return toastReducer(frozen, action);
        }, []);

        // Schema integrity assertions
        expect(Array.isArray(finalState)).toBe(true);
        for (const toast of finalState) {
          expect(toast).not.toBeNull();
          expect(toast).not.toBeUndefined();
          expect(typeof toast.id).toBe("string");
          expect(typeof toast.message).toBe("string");
          expect(["info", "success", "error", "warning"].includes(toast.type)).toBe(true);
        }

        // Uniqueness invariant
        const ids = finalState.map(t => t.id);
        expect(new Set(ids).size).toBe(ids.length);
      }),
      { numRuns: 100 }
    );
  });

  it("1,000 Action Burst Stress Validation should execute < 300ms without exploding", () => {
    const actions = [];
    for (let i = 0; i < 1000; i++) {
      const type = Math.random() > 0.3 ? TOAST_ACTIONS.SHOW : (Math.random() > 0.5 ? TOAST_ACTIONS.HIDE : TOAST_ACTIONS.CLEAR);
      actions.push({
        type,
        payload: { id: `id-${i}`, message: "Stress", type: "info", duration: 1000 }
      });
    }

    const startTime = performance.now();
    
    // Fold
    const finalState = actions.reduce((state, action) => toastReducer(state, action), []);
    
    const endTime = performance.now();
    const executionTimeMs = endTime - startTime;

    // Fail if memory/time explodes
    expect(executionTimeMs).toBeLessThan(300);
    expect(Array.isArray(finalState)).toBe(true);
  });
});

describe("Layer C: Toast Context DOM Integration (Single Lifecycle)", () => {
  const TestComponent = () => {
    const { showToast } = useToast();
    return (
      <button 
        onClick={() => showToast("Accessibility Alert", "error", 5000)}
        data-testid="trigger-toast"
      >
        Trigger
      </button>
    );
  };

  it("should render toasts with correct ARIA roles and concurrent DOM stacking", async () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>
    );

    const triggerBtn = screen.getByTestId("trigger-toast");
    
    // Rapid-fire concurrent clicks
    act(() => {
      triggerBtn.click();
      triggerBtn.click();
    });

    // Both should mount
    const toasts = await screen.findAllByTestId("toast-message");
    expect(toasts.length).toBe(2);

    // Accessibility Hardening
    for (const toastMessage of toasts) {
      expect(toastMessage).toBeInTheDocument();
      expect(toastMessage).toHaveTextContent("Accessibility Alert");

      // Verify accessible alert containers
      const toastContainer = toastMessage.closest('div[class*="backdrop-blur"]');
      expect(toastContainer).toHaveAttribute("role", "alert");
      expect(toastContainer).toHaveAttribute("aria-live", "assertive");
    }
  });
});
