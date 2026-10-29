// Lets a test read a source file as text through the bundler (`import src from "./x.ts?raw"`).
declare module "*?raw" {
  const text: string;
  export default text;
}
