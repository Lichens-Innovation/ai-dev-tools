# Board example: pieces moving between cells

Use this for grids and boards (chess, kanban cells, calendar slots, seat maps) where an item moves from one cell to another and a rule decides whether the move is legal. This is the library's own chess example, condensed. There is no list order here, so no closest edge: each cell is a drop target and one monitor applies the move.

## Pattern

1. Each cell is a `dropTargetForElements` whose `getData` returns the cell's location.
2. Each piece is a `draggable` whose `getInitialData` returns its location and type.
3. One `monitorForElements` at the board level reads both on drop, checks the rule, and updates state.
4. A cell can use `canDrop` to highlight legal targets while a piece is dragged.

## Board with a monitor

```tsx
import { useEffect, useState } from "react";
import { monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";

type Coord = [number, number];
type PieceType = "king" | "pawn";
type PieceRecord = { type: PieceType; location: Coord };

const isCoord = (value: unknown): value is Coord =>
  Array.isArray(value) && value.length === 2 && value.every((n) => typeof n === "number");

const isPieceType = (value: unknown): value is PieceType => value === "king" || value === "pawn";

const isEqualCoord = (a: Coord, b: Coord) => a[0] === b[0] && a[1] === b[1];

/** The rule: kept pure so it can be unit tested without any DOM. */
function canMove(start: Coord, destination: Coord, pieceType: PieceType, pieces: PieceRecord[]): boolean {
  const rowDist = Math.abs(start[0] - destination[0]);
  const colDist = Math.abs(start[1] - destination[1]);

  if (pieces.some((piece) => isEqualCoord(piece.location, destination))) return false;

  switch (pieceType) {
    case "king":
      return [0, 1].includes(rowDist) && [0, 1].includes(colDist);
    case "pawn":
      return colDist === 0 && start[0] - destination[0] === -1;
  }
}

export function Chessboard() {
  const [pieces, setPieces] = useState<PieceRecord[]>([
    { type: "king", location: [3, 2] },
    { type: "pawn", location: [1, 6] },
  ]);

  useEffect(() => {
    return monitorForElements({
      onDrop({ source, location }) {
        const destination = location.current.dropTargets[0];
        if (!destination) return;

        const destinationLocation = destination.data.location;
        const sourceLocation = source.data.location;
        const pieceType = source.data.pieceType;
        if (!isCoord(destinationLocation) || !isCoord(sourceLocation) || !isPieceType(pieceType)) return;

        const piece = pieces.find((p) => isEqualCoord(p.location, sourceLocation));
        if (!piece || !canMove(sourceLocation, destinationLocation, pieceType, pieces)) return;

        setPieces([
          { type: piece.type, location: destinationLocation },
          ...pieces.filter((p) => p !== piece),
        ]);
      },
    });
  }, [pieces]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", width: 500, height: 500 }}>
      {/* render 64 <Square pieces={pieces} location={[row, col]}> with the piece inside, if any */}
    </div>
  );
}
```

## Square and piece (the parts the monitor reads)

```tsx
// Square: drop target that reports its location and highlights legal moves
useEffect(() => {
  const element = ref.current;
  invariant(element);

  return dropTargetForElements({
    element,
    getData: () => ({ location }),
    canDrop: ({ source }) =>
      isCoord(source.data.location) &&
      isPieceType(source.data.pieceType) &&
      canMove(source.data.location, location, source.data.pieceType, pieces),
    onDragEnter: () => setIsOver(true),
    onDragLeave: () => setIsOver(false),
    onDrop: () => setIsOver(false),
  });
}, [location, pieces]);

// Piece: draggable carrying its location and type
useEffect(() => {
  const element = ref.current;
  invariant(element);

  return draggable({
    element,
    getInitialData: () => ({ location, pieceType }),
    onDragStart: () => setDragging(true),
    onDrop: () => setDragging(false),
  });
}, [location, pieceType]);
```

Notes:

- With `canDrop` on the squares, illegal squares never become drop targets, so `location.current.dropTargets[0]` is already a legal destination. Keep the rule check in the monitor anyway: it is the source of truth for state changes.
- Drag data here uses plain string keys because there is a single kind of draggable. Use symbol keys as in `SKILL.md` as soon as a second kind shares the page.
