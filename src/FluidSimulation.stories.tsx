import type { Meta, StoryFn } from "@storybook/react";
import React from "react";
import { FluidSimulation } from "./FluidSimulation";

const meta = {
  title: "Components/FluidSimulation",
  component: FluidSimulation,
  parameters: {
    layout: "fullscreen",
  },
} satisfies Meta<typeof FluidSimulation>;

export default meta;

const Template: StoryFn<typeof FluidSimulation> = (args) => (
  <FluidSimulation {...args} />
);

export const Default = Template.bind({});
Default.args = {
  width: 800,
  height: 600,
};

export const CustomColors = Template.bind({});
CustomColors.args = {
  width: 800,
  height: 600,
  config: {
    BACK_COLOR: { r: 0.1, g: 0.1, b: 0.15 },
    COLOR_SCHEME: "sunset",
  },
};

export const HighPerformance = Template.bind({});
HighPerformance.args = {
  width: 800,
  height: 600,
  config: {
    SIM_RESOLUTION: 256,
    DYE_RESOLUTION: 512,
    DENSITY_DISSIPATION: 3,
    VELOCITY_DISSIPATION: 0.8,
    PRESSURE_ITERATIONS: 15,
    SPLAT_RADIUS: 0.0005,
    SPLAT_FORCE: 10000,
    BLOOM_ITERATIONS: 8,
    BLOOM_RESOLUTION: 256,
    BLOOM_INTENSITY: 0.15,
    BLOOM_THRESHOLD: 0.0,
    BLOOM_SOFT_KNEE: 0.7,
    SUNRAYS_RESOLUTION: 196,
    SUNRAYS_WEIGHT: 0.1,
  },
};

export const ArtisticEffects = Template.bind({});
ArtisticEffects.args = {
  width: 800,
  height: 600,
  config: {
    SIM_RESOLUTION: 512,
    DYE_RESOLUTION: 1024,
    DENSITY_DISSIPATION: 1.5,
    VELOCITY_DISSIPATION: 0.95,
    PRESSURE_ITERATIONS: 25,
    CURL: 0.2,
    SPLAT_RADIUS: 0.0002,
    SPLAT_FORCE: 6000,
    BLOOM_ITERATIONS: 12,
    BLOOM_RESOLUTION: 512,
    BLOOM_INTENSITY: 0.25,
    BLOOM_THRESHOLD: 0.1,
    BLOOM_SOFT_KNEE: 0.9,
    SUNRAYS_RESOLUTION: 256,
    SUNRAYS_WEIGHT: 0.2,
  },
};
