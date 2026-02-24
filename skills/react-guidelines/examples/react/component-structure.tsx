/**
 * REACT COMPONENT STRUCTURE
 * Rule: Functional components only. Always type props. Default values in destructuring.
 */

import React, { useState, useEffect, FunctionComponent } from "react";

// ─────────────────────────────────────────────
// BASIC COMPONENT — props interface + defaults (no inline types)
// ─────────────────────────────────────────────

type ButtonVariant = "primary" | "secondary" | "danger";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps {
  children: React.ReactNode;
  onClick: VoidFunction;
  disabled?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button: FunctionComponent<ButtonProps> = ({
  children,
  onClick,
  disabled = false,
  variant = "primary",
  size = "md",
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`btn btn-${variant} btn-${size}`}
  >
    {children}
  </button>
);

// ❌ BAD — untyped, no defaults
export const ButtonBad: FunctionComponent<any> = (props) => (
  <button onClick={props.onClick}>{props.children}</button>
);

// ❌ BAD — not using arrow function and not using destructuring for arguments
export function ButtonBadFunction(props: ButtonProps) {
  return (
    <button onClick={props.onClick}>{props.children}</button>
  );
}

// ─────────────────────────────────────────────
// CONDITIONAL RENDERING — clear patterns
// ─────────────────────────────────────────────

interface DataDisplayProps {
  isLoading: boolean;
  error: Error | null;
  data: string[] | null;
}

// ✅ GOOD — one condition per line, readable
export const DataDisplay: FunctionComponent<DataDisplayProps> = ({
  isLoading,
  error,
  data,
}) => {
  if (isLoading) return <Spinner />;
  if (error) return <ErrorMessage message={error.message} />;
  if (!data) return null;

  return (
    <ul>
      {data.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
};
// Prefer key={item.id} (or other stable id); avoid key={index}. If list has no id, use a unique field or generate a stable key.

// ❌ BAD — ternary hell, unreadable (multiple nested ternary operators)
export const DataDisplayBad: FunctionComponent<DataDisplayProps> = ({
  isLoading,
  error,
  data,
}) =>
  isLoading ? (
    <Spinner />
  ) : error ? (
    <ErrorMessage message={error.message} />
  ) : data ? (
    <ul>{data.map((item, i) => <li key={i}>{item}</li>)}</ul>
  ) : null;

// ─────────────────────────────────────────────
// COMPONENT WITH DATA FETCHING
// ─────────────────────────────────────────────

type MarketStatus = "active" | "resolved" | "closed";

interface Market {
  id: string;
  name: string;
  status: MarketStatus;
}

interface MarketCardProps {
  marketId: string;
  onClose?: VoidFunction;
}

// ✅ GOOD — clear structure: types → state → effects → handlers → render
export const MarketCard: FunctionComponent<MarketCardProps> = ({
  marketId,
  onClose,
}) => {
  // State
  const [market, setMarket] = useState<Market | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Effects
  useEffect(() => {
    let cancelled = false;

    const loadMarket = async () => {
      try {
        setIsLoading(true);
        const data = await fetchMarket(marketId);
        if (!cancelled) setMarket(data);
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    loadMarket();
    return () => { cancelled = true; }; // Cleanup to avoid state updates on unmount
  }, [marketId]);

  // Handlers
  const handleCloseClick = () => {
    onClose?.();
  };

  // Render
  if (isLoading) return <Spinner />;
  if (error) return <ErrorMessage message={error.message} />;
  if (!market) return null;

  return (
    <div className="market-card">
      <h2>{market.name}</h2>
      <span className={`status status-${market.status}`}>{market.status}</span>
      {onClose && <button onClick={handleCloseClick}>Close</button>}
    </div>
  );
};

// ─────────────────────────────────────────────
// COMPONENT SIZE RULE
// ─────────────────────────────────────────────

// ✅ GOOD — if a component grows beyond ~100 lines, extract sub-components

// Large component → split into:
// market-list.tsx        (list container + fetching logic)
// market-list-item.tsx    (single row rendering)
// market-list-filters.tsx (filter controls)
// use-market-list.ts      (custom hook for data logic)

// ─────────────────────────────────────────────
// STRING PROPS — no curly braces for string literals
// ─────────────────────────────────────────────

// ❌ BAD — unnecessary curly braces
// <Button text={"Click me"} variant={"primary"} />

// ✅ GOOD — pass string literals directly
// <Button text="Click me" variant="primary" />

// ─────────────────────────────────────────────
// EXPLICIT BOOLEAN IN CONDITIONAL RENDERING
// ─────────────────────────────────────────────
// Using items.length && <List /> can render "0" when length is 0. Use explicit boolean.

// ❌ BAD — items.length is a number; 0 is rendered
// {items.length && <List items={items} />}

// ✅ GOOD — condition is boolean
// const hasItems = items.length > 0;
// {hasItems && <List items={items} />}

// ─────────────────────────────────────────────
// STATIC DATA — move outside component
// ─────────────────────────────────────────────
// Constants or static arrays/functions that do not depend on props or state should live outside the component to avoid new references each render and to keep the component focused.

// ❌ BAD — OPTIONS recreated every render
// const Select = () => {
//   const OPTIONS = ["A", "B", "C"];
//   return <select>{OPTIONS.map((opt) => <option key={opt}>{opt}</option>)}</select>;
// };

// ✅ GOOD — static data outside
const SELECT_OPTIONS = ["A", "B", "C"];
export const SelectGood: FunctionComponent<Record<string, never>> = () => (
  <select>
    {SELECT_OPTIONS.map((opt) => (
      <option key={opt}>{opt}</option>
    ))}
  </select>
);

// ─────────────────────────────────────────────
// STORE SELECTED ITEM BY ID — not the whole object
// ─────────────────────────────────────────────
// Derive the selected item from the list with find( id ); avoids stale references if the list item changes.

// ❌ BAD — storing full item can go stale
// const [selectedItem, setSelectedItem] = useState<Item | undefined>();

// ✅ GOOD — store id; derive item from list
// const [selectedItemId, setSelectedItemId] = useState<string | undefined>();
// const selectedItem = items.find((i) => i.id === selectedItemId);

// ─────────────────────────────────────────────
// INITIAL VS CURRENT STATE — clear naming
// ─────────────────────────────────────────────
// Use initialX for props that set the starting value; use x for the current state variable.

// ❌ BAD — unclear whether sortOrder is initial or current
// const Main = ({ sortOrder }: { sortOrder: string }) => {
//   const [internalSortOrder, setInternalSortOrder] = useState(sortOrder);

// ✅ GOOD — initialSortOrder vs sortOrder (current)
// const Main = ({ initialSortOrder }: { initialSortOrder: string }) => {
//   const [sortOrder, setSortOrder] = useState(initialSortOrder);

// ─────────────────────────────────────────────
// CHILDREN & REACT NODE — use ReactNode and PropsWithChildren
// ─────────────────────────────────────────────

// ❌ BAD — verbose union type for children
// interface PanelProps { leftElement: JSX.Element | null | undefined; }

// ✅ GOOD — ReactNode covers all renderable content
// interface PanelProps { leftElement: React.ReactNode; rightElement: React.ReactNode; }

// ✅ GOOD — PropsWithChildren for components that accept children
// import { PropsWithChildren } from "react";
// const Layout: FunctionComponent<PropsWithChildren<LayoutProps>> = ({ children, ...props }) => ( ... );

// ─────────────────────────────────────────────
// useEffect — always clean up (intervals, subscriptions, listeners)
// ─────────────────────────────────────────────
// MarketCard above shows cleanup (return () => { cancelled = true; }). Same for setInterval, addEventListener, etc.: return a cleanup function from useEffect.

// Stubs
const fetchMarket = async (id: string): Promise<Market> =>
  ({ id, name: "Example", status: "active" });
const Spinner = () => <div>Loading...</div>;

interface ErrorMessageProps {
  message: string;
}
const ErrorMessage: FunctionComponent<ErrorMessageProps> = ({ message }) => (
  <div>{message}</div>
);
