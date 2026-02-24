/**
 * Component template — use when creating a React component.
 * File name: kebab-case (e.g. my-feature-card.tsx).
 * Export: named. Default export only when required by framework (e.g. Expo Router).
 */

import { type FunctionComponent } from "react";

export interface ExampleComponentProps {
  title: string;
  onAction?: () => void;
  className?: string;
}

export const ExampleComponent: FunctionComponent<ExampleComponentProps> = ({
  title,
  onAction,
  className,
}) => {
  if (!title) {
    return null;
  }

  return (
    <div className={className}>
      <h2>{title}</h2>
      {onAction !== undefined && (
        <button type="button" onClick={onAction}>
          Action
        </button>
      )}
    </div>
  );
};
