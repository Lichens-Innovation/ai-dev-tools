/**
 * STATE MANAGEMENT — React
 * Rule: Use functional updates when next state depends on previous state.
 *       Co-locate state with the component that owns it.
 */

import { useState, useReducer, useCallback, FunctionComponent } from "react";

// ─────────────────────────────────────────────
// FUNCTIONAL UPDATES — avoid stale closures
// ─────────────────────────────────────────────

export const Counter: FunctionComponent = () => {
  const [count, setCount] = useState(0);

  // ✅ GOOD — functional update, always uses latest value
  const increment = useCallback(() => setCount((prev) => prev + 1), []);
  const decrement = useCallback(() => setCount((prev) => prev - 1), []);
  const reset = useCallback(() => setCount(0), []);

  // ❌ BAD — `count` in closure may be stale in async contexts
  // const incrementBad = () => setCount(count + 1);

  return (
    <div>
      <button onClick={decrement}>−</button>
      <span>{count}</span>
      <button onClick={increment}>+</button>
      <button onClick={reset}>Reset</button>
    </div>
  );
};

// ─────────────────────────────────────────────
// useReducer — for complex state with multiple sub-values
// ─────────────────────────────────────────────

interface MarketFilters {
  status: "all" | "active" | "resolved" | "closed";
  searchQuery: string;
  sortBy: "name" | "createdAt" | "status";
  sortDirection: "asc" | "desc";
  page: number;
}

type FilterAction =
  | { type: "SET_STATUS"; payload: MarketFilters["status"] }
  | { type: "SET_SEARCH"; payload: string }
  | { type: "SET_SORT"; payload: { by: MarketFilters["sortBy"]; direction: MarketFilters["sortDirection"] } }
  | { type: "SET_PAGE"; payload: number }
  | { type: "RESET" };

const initialFilters: MarketFilters = {
  status: "all",
  searchQuery: "",
  sortBy: "createdAt",
  sortDirection: "desc",
  page: 1,
};

// ✅ GOOD — reducer keeps state transitions explicit and testable
const filtersReducer = (
  state: MarketFilters,
  action: FilterAction
): MarketFilters => {
  switch (action.type) {
    case "SET_STATUS":
      return { ...state, status: action.payload, page: 1 }; // reset page on filter change
    case "SET_SEARCH":
      return { ...state, searchQuery: action.payload, page: 1 };
    case "SET_SORT":
      return { ...state, sortBy: action.payload.by, sortDirection: action.payload.direction };
    case "SET_PAGE":
      return { ...state, page: action.payload };
    case "RESET":
      return initialFilters;
    default:
      return state;
  }
};

export const MarketFiltersPanel: FunctionComponent = () => {
  const [filters, dispatch] = useReducer(filtersReducer, initialFilters);

  return (
    <div>
      <input
        value={filters.searchQuery}
        onChange={(e) => dispatch({ type: "SET_SEARCH", payload: e.target.value })}
        placeholder="Search markets..."
      />
      <select
        value={filters.status}
        onChange={(e) =>
          dispatch({
            type: "SET_STATUS",
            payload: e.target.value as MarketFilters["status"],
          })
        }
      >
        <option value="all">All</option>
        <option value="active">Active</option>
        <option value="resolved">Resolved</option>
      </select>
      <button onClick={() => dispatch({ type: "RESET" })}>Reset filters</button>
      <pre>{JSON.stringify(filters, null, 2)}</pre>
    </div>
  );
};

// ─────────────────────────────────────────────
// STATE CO-LOCATION — keep state close to use
// ─────────────────────────────────────────────

// ✅ GOOD — modal open state lives in the component that controls the modal
export const UserList: FunctionComponent = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const handleEditUser = (userId: string) => {
    setSelectedUserId(userId);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedUserId(null);
  };

  return (
    <div>
      <button onClick={() => handleEditUser("123")}>Edit user 123</button>
      {isModalOpen && selectedUserId && (
        <div className="modal">
          <p>Editing user {selectedUserId}</p>
          <button onClick={handleCloseModal}>Close</button>
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────
// DERIVED STATE — compute from existing state, don't duplicate
// ─────────────────────────────────────────────

interface Item { id: string; name: string; selected: boolean; }

export const ItemList: FunctionComponent = () => {
  const [items, setItems] = useState<Item[]>([
    { id: "1", name: "Apple", selected: false },
    { id: "2", name: "Banana", selected: true },
  ]);

  // ✅ GOOD — derived from state, not stored separately
  const selectedCount = items.filter((item) => item.selected).length;
  const hasSelection = selectedCount > 0;

  // ❌ BAD — storing derived state separately causes sync issues
  // const [selectedCount, setSelectedCount] = useState(0);

  const toggleItem = (id: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, selected: !item.selected } : item
      )
    );
  };

  return (
    <div>
      <p>{selectedCount} item(s) selected</p>
      {hasSelection && <button>Delete selected</button>}
      {items.map((item) => (
        <label key={item.id}>
          <input
            type="checkbox"
            checked={item.selected}
            onChange={() => toggleItem(item.id)}
          />
          {item.name}
        </label>
      ))}
    </div>
  );
};
