import type { Meta, StoryObj } from "@storybook/react";
import React from "react";

const meta = {
  title: "Theme/Colors",
  tags: ["autodocs"],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const ColorSwatch = ({
  colorClass,
  name,
}: {
  colorClass: string;
  name: string;
}) => (
  <div className="flex flex-col">
    <div className={`w-24 h-24 rounded-lg shadow-md ${colorClass}`} />
    <div className="mt-2 text-sm font-medium">{name}</div>
    <div className="text-xs text-gray-500">{colorClass}</div>
  </div>
);

const ColorSection = ({
  title,
  colors,
}: {
  title: string;
  colors: { [key: string]: string };
}) => (
  <div className="mb-8">
    <h2 className="text-xl font-semibold mb-4">{title}</h2>
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-6">
      {Object.entries(colors).map(([name, colorClass]) => (
        <ColorSwatch key={name} name={name} colorClass={colorClass} />
      ))}
    </div>
  </div>
);

export const PrimaryColors: Story = {
  render: () => (
    <div className="p-6 dark:bg-background">
      <ColorSection
        title="Primary Colors"
        colors={{
          "Primary 50": "bg-primary-50",
          "Primary 100": "bg-primary-100",
          "Primary 200": "bg-primary-200",
          "Primary 300": "bg-primary-300",
          "Primary 400": "bg-primary-400",
          "Primary 500": "bg-primary-500",
          "Primary 600": "bg-primary-600",
          "Primary 700": "bg-primary-700",
          "Primary 800": "bg-primary-800",
          "Primary 900": "bg-primary-900",
        }}
      />
    </div>
  ),
};

export const SecondaryColors: Story = {
  render: () => (
    <div className="p-6 dark:bg-background">
      <ColorSection
        title="Secondary Colors"
        colors={{
          "Secondary 50": "bg-secondary-50",
          "Secondary 100": "bg-secondary-100",
          "Secondary 200": "bg-secondary-200",
          "Secondary 300": "bg-secondary-300",
          "Secondary 400": "bg-secondary-400",
          "Secondary 500": "bg-secondary-500",
          "Secondary 600": "bg-secondary-600",
          "Secondary 700": "bg-secondary-700",
          "Secondary 800": "bg-secondary-800",
          "Secondary 900": "bg-secondary-900",
        }}
      />
    </div>
  ),
};

export const BackgroundColors: Story = {
  render: () => (
    <div className="p-6 dark:bg-background">
      <ColorSection
        title="Background Colors"
        colors={{
          "Background 50": "bg-background-50",
          "Background 100": "bg-background-100",
          "Background 200": "bg-background-200",
          "Background 300": "bg-background-300",
          "Background 400": "bg-background-400",
          "Background 500": "bg-background-500",
          "Background 600": "bg-background-600",
          "Background 700": "bg-background-700",
          "Background 800": "bg-background-800",
          "Background 900": "bg-background-900",
        }}
      />
    </div>
  ),
};

export const AllColors: Story = {
  render: () => (
    <div className="p-6 dark:bg-background">
      <h1 className="text-2xl font-bold mb-8">Theme Colors</h1>

      <ColorSection
        title="Primary Colors"
        colors={{
          "Primary 50": "bg-primary-50",
          "Primary 100": "bg-primary-100",
          "Primary 200": "bg-primary-200",
          "Primary 300": "bg-primary-300",
          "Primary 400": "bg-primary-400",
          "Primary 500": "bg-primary-500",
          "Primary 600": "bg-primary-600",
          "Primary 700": "bg-primary-700",
          "Primary 800": "bg-primary-800",
          "Primary 900": "bg-primary-900",
        }}
      />

      <ColorSection
        title="Secondary Colors"
        colors={{
          "Secondary 50": "bg-secondary-50",
          "Secondary 100": "bg-secondary-100",
          "Secondary 200": "bg-secondary-200",
          "Secondary 300": "bg-secondary-300",
          "Secondary 400": "bg-secondary-400",
          "Secondary 500": "bg-secondary-500",
          "Secondary 600": "bg-secondary-600",
          "Secondary 700": "bg-secondary-700",
          "Secondary 800": "bg-secondary-800",
          "Secondary 900": "bg-secondary-900",
        }}
      />

      <ColorSection
        title="Background Colors"
        colors={{
          "Background 50": "bg-background-50",
          "Background 100": "bg-background-100",
          "Background 200": "bg-background-200",
          "Background 300": "bg-background-300",
          "Background 400": "bg-background-400",
          "Background 500": "bg-background-500",
          "Background 600": "bg-background-600",
          "Background 700": "bg-background-700",
          "Background 800": "bg-background-800",
          "Background 900": "bg-background-900",
        }}
      />

      <div className="mt-8">
        <h2 className="text-xl font-semibold mb-4">Base Colors</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          <ColorSwatch name="Black" colorClass="bg-black" />
          <ColorSwatch
            name="White"
            colorClass="bg-white border border-gray-200"
          />
          <ColorSwatch name="Text Secondary" colorClass="bg-gray-500" />
          <ColorSwatch name="Code Background" colorClass="bg-gray-900" />
        </div>
      </div>
    </div>
  ),
};

export const ColorUsage: Story = {
  render: () => (
    <div className="p-6 space-y-8 dark:bg-background">
      <div>
        <h2 className="text-xl font-semibold mb-4">Text Colors</h2>
        <div className="space-y-4">
          <p className="text-gray-900">Text Gray 900</p>
          <p className="text-gray-500">Text Gray 500</p>
          <p className="text-primary-500">Text Primary 500</p>
          <p className="text-secondary-500">Text Secondary 500</p>
        </div>
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-4">Background Colors</h2>
        <div className="space-y-4">
          <div className="p-4 bg-white dark:bg-gray-900 text-gray-100">
            Background White/Dark
          </div>
          <div className="p-4 bg-gray-100 dark:bg-gray-800 text-gray-100">
            Background Gray 100/800
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-4">Border Colors</h2>
        <div className="space-y-4">
          <div className="p-4 border border-gray-200 dark:border-gray-700">
            Border Gray 200/700
          </div>
        </div>
      </div>
    </div>
  ),
};
