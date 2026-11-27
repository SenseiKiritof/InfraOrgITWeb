import "@testing-library/jest-dom/vitest";
import { configure } from "@testing-library/dom";

// CI runners are slower than a workstation: keep async queries from failing
// at the one-second default while the UI settles.
configure({ asyncUtilTimeout: 3000 });
