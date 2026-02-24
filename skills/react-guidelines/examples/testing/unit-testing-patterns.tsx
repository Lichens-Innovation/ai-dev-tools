/**
 * UNIT TESTING PATTERNS — Jest & React Testing Library
 * Rules:
 * - Use AAA (Arrange-Act-Assert) for clear structure.
 * - Prefer screen.getBy* over destructuring from render().
 * - Mock custom hooks with jest.spyOn(module, 'hookName') and clean up.
 * - Use it.each for parametrized tests instead of multiple similar it() blocks.
 * - Prefer getByRole over getByTestId for semantic queries and accessibility.
 * - Use mock factory functions (buildMockX(overrides?)) instead of shared mutable objects.
 */

// ─────────────────────────────────────────────
// 1. AAA PATTERN — Arrange, Act, Assert
// ─────────────────────────────────────────────

// ❌ BAD — No clear structure; setup, action, and assertion are mixed
// test('should increment count on button press', () => {
//   render(<MyComponent />);
//   const button = screen.getByText('Increment');
//   fireEvent.press(button);
//   expect(screen.getByText('Count: 1')).toBeTruthy();
// });

// ✅ GOOD — AAA comments separate the three phases
// describe('MyComponent', () => {
//   it('should increment count on button press', () => {
//     // Arrange
//     render(<MyComponent />);
//
//     // Act
//     const button = screen.getByText('Increment');
//     fireEvent.press(button);
//
//     // Assert
//     expect(screen.getByText('Count: 1')).toBeTruthy();
//   });
// });

// ─────────────────────────────────────────────
// 2. screen.getBy* OVER DESTRUCTURING FROM render()
// ─────────────────────────────────────────────

// ❌ BAD — Destructuring getByText from render spreads query logic and adds variables
// const { getByText } = render(<MyComponent />);
// const button = getByText('Increment');
// expect(getByText('Count: 1')).toBeTruthy();

// ✅ GOOD — Use screen so all queries come from one place; better for RTL best practices
// render(<MyComponent />);
// const button = screen.getByText('Increment');
// expect(screen.getByText('Count: 1')).toBeTruthy();

// ─────────────────────────────────────────────
// 3. jest.spyOn FOR MOCKING CUSTOM HOOKS
// ─────────────────────────────────────────────

// ❌ BAD — jest.mock + (useMyHook as jest.Mock).mockReturnValue is less explicit
// jest.mock('path/to/my-custom-hook', () => ({ useMyCustomHook: jest.fn() }));
// (useMyCustomHook as jest.Mock).mockReturnValue('mocked data');

// ✅ GOOD — jest.spyOn with explicit module import; clear which function is mocked; restore in afterAll
// import * as hookModule from 'path/to/my-custom-hook';
// const useMyCustomHookSpy = jest.spyOn(hookModule, 'useMyCustomHook');
// afterEach(() => useMyCustomHookSpy.mockClear());
// afterAll(() => useMyCustomHookSpy.mockRestore());
// useMyCustomHookSpy.mockReturnValue('mocked data');

// ─────────────────────────────────────────────
// 4. it.each FOR PARAMETRIZED TESTS
// ─────────────────────────────────────────────

// ❌ BAD — Repetitive it() blocks with nearly identical logic
// it('should render with text "Hello, Alice!"', () => {
//   render(<Greeting name="Alice" />);
//   expect(screen.getByText('Hello, Alice!')).toBeTruthy();
// });
// it('should render with text "Hello, Bob!"', () => { ... });
// it('should render with text "Hello, Charlie!"', () => { ... });

// ✅ GOOD — Single it.each with table; easier to add cases and maintain
// it.each`
//   name       | expected
//   ${'Alice'} | ${'Hello, Alice!'}
//   ${'Bob'}   | ${'Hello, Bob!'}
//   ${'Charlie'} | ${'Hello, Charlie!'}
// `('should render with text "$expected"', ({ name, expected }) => {
//   render(<Greeting name={name} />);
//   expect(screen.getByText(expected)).toBeTruthy();
// });

// ─────────────────────────────────────────────
// 5. getByRole OVER getByTestId
// ─────────────────────────────────────────────

// ❌ BAD — testID is non-semantic; tests couple to implementation details
// <Text testID="heading">Welcome</Text>
// <Button testID="submit-button" title="Submit" onPress={() => {}} />
// const button = screen.getByTestId('submit-button');

// ✅ GOOD — accessibilityRole and getByRole align with how users and assistive tech see the UI
// <Text accessibilityRole="header">Welcome</Text>
// <Button title="Submit" onPress={() => {}} />
// const button = screen.getByRole('button', { name: 'Submit' });
// const heading = screen.getByRole('header', { name: 'Welcome' });

// ─────────────────────────────────────────────
// 6. MOCK FACTORY OVER SHARED MUTABLE OBJECT
// ─────────────────────────────────────────────

// ❌ BAD — Shared object mutated by one test can break others
// export const mockPerson: Person = { id: 1, name: 'John', age: 30 };
// it('should update name', () => {
//   mockPerson.name = 'Jane';
//   expect(mockPerson.name).toBe('Jane');
// });
// it('should have initial name', () => {
//   expect(mockPerson.name).toBe('John'); // Fails: previous test mutated shared state
// });

// ✅ GOOD — Factory returns a new object per test; overrides allow per-test customization
export type Person = { id: number; name: string; age: number; email: string };

export const buildMockPerson = (overrides?: Partial<Person>): Person => ({
  id: 1,
  name: 'John Doe',
  age: 30,
  email: 'john.doe@example.com',
  ...overrides,
});

// In tests:
// it('should update name in one instance', () => {
//   const person = buildMockPerson({ name: 'Jane Doe' });
//   expect(person.name).toBe('Jane Doe');
// });
// it('should not affect other instances', () => {
//   const person = buildMockPerson();
//   expect(person.name).toBe('John Doe');
// });
