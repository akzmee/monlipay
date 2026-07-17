import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

// Mock @react-three/fiber and @react-three/drei — they need WebGL which
// jsdom doesn't provide. We render shallow replacements.
vi.mock("@react-three/fiber", () => ({
  Canvas: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="canvas">{children}</div>
  ),
  useFrame: vi.fn(),
}));

vi.mock("@react-three/drei", () => ({
  Float: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="float">{children}</div>
  ),
  Icosahedron: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="ico">{children}</div>
  ),
  Octahedron: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="octa">{children}</div>
  ),
  Torus: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="torus">{children}</div>
  ),
  MeshDistortMaterial: ({ color }: { color?: string }) => (
    <div data-testid="material" data-color={color} />
  ),
}));

vi.mock("three", () => ({}));

import { Scene3D } from "@/components/Scene3D";

describe("Scene3D", () => {
  it("should render without crashing", () => {
    const { container } = render(<Scene3D />);
    expect(container.firstChild).not.toBeNull();
  });

  it("should render a Canvas element", () => {
    const { getByTestId } = render(<Scene3D />);
    expect(getByTestId("canvas")).toBeInTheDocument();
  });

  it("should render multiple floating shapes", () => {
    const { getAllByTestId } = render(<Scene3D />);
    // 6 FloatingShape components
    expect(getAllByTestId("float").length).toBeGreaterThanOrEqual(3);
  });

  it("should be fixed-position and behind content", () => {
    const { container } = render(<Scene3D />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain("fixed");
    expect(wrapper.className).toContain("-z-10");
  });
});
