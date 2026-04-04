import React, { useEffect, useState } from "react";
import { Box, Text, render, useInput } from "ink";
import { BUNDLERS, TOOLING_KEYS } from "../lib/constants.js";

const h = React.createElement;

const PRESET_OPTIONS = [
  {
    value: "base",
    label: "base runtime",
    description: "Install sdk + compiler and generate a minimal runtime path.",
  },
  {
    value: "lineage",
    label: "lineage runtime",
    description: "Add seal-aware continuity on top of the base runtime path.",
  },
  {
    value: "gov",
    label: "gov runtime",
    description: "Add lineage + governance on top of the base runtime path.",
  },
];

const TOOLING_OPTIONS = [
  {
    value: "codegen",
    label: "codegen",
    description: "Wire createCompilerCodegen() into supported bundlers.",
  },
  {
    value: "skills",
    label: "skills",
    description: "Install @manifesto-ai/skills and print the explicit next steps.",
  },
];

const SAMPLE_OPTIONS = [
  {
    value: true,
    label: "generate sample files",
    description: "Create a counter MEL domain and starter runtime integration.",
  },
  {
    value: false,
    label: "skip sample files",
    description: "Only update package/config state without demo source files.",
  },
];

const REVIEW_ACTIONS = [
  { value: "confirm", label: "apply init" },
  { value: "back", label: "go back" },
  { value: "cancel", label: "cancel" },
];

export async function runInitWizard({
  bundler,
  detection,
  preset,
  tooling,
  sample,
  dryRun,
}) {
  const bundlerOptions = buildBundlerOptions(detection);

  return new Promise((resolve) => {
    let settled = false;
    let instance = null;

    const finish = (value) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(value);
      if (instance) {
        instance.unmount();
      }
    };

    instance = render(h(InitWizardApp, {
      bundlerOptions,
      detection,
      initialBundler: bundler ?? bundlerOptions[0]?.value ?? "vite",
      initialPreset: preset ?? "base",
      initialTooling: Array.isArray(tooling) ? tooling : [],
      initialSample: sample,
      dryRun,
      onSubmit: finish,
      onCancel: () => finish(null),
    }));
  });
}

function InitWizardApp({
  bundlerOptions,
  detection,
  initialBundler,
  initialPreset,
  initialTooling,
  initialSample,
  dryRun,
  onSubmit,
  onCancel,
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [cursor, setCursor] = useState(0);
  const [bundler, setBundler] = useState(initialBundler);
  const [preset, setPreset] = useState(initialPreset);
  const [tooling, setTooling] = useState(dedupeTooling(initialTooling));
  const [sample, setSample] = useState(initialSample);

  useEffect(() => {
    setCursor(defaultCursorForStep(stepIndex, {
      bundler,
      bundlerOptions,
      preset,
      sample,
    }));
  }, [stepIndex]);

  useInput((input, key) => {
    if (input === "q" || key.escape) {
      onCancel();
      return;
    }

    if (key.leftArrow || key.backspace || key.delete) {
      if (stepIndex > 0) {
        setStepIndex(stepIndex - 1);
      }
      return;
    }

    const maxIndex = maxCursorForStep(stepIndex);
    if (key.downArrow || input === "j") {
      setCursor((current) => Math.min(current + 1, maxIndex));
      return;
    }

    if (key.upArrow || input === "k") {
      setCursor((current) => Math.max(current - 1, 0));
      return;
    }

    if (stepIndex === 0 && (key.return || input === " ")) {
      const nextBundler = bundlerOptions[cursor]?.value;
      if (nextBundler) {
        setBundler(nextBundler);
        setStepIndex(1);
      }
      return;
    }

    if (stepIndex === 1 && (key.return || input === " ")) {
      const nextPreset = PRESET_OPTIONS[cursor]?.value;
      if (nextPreset) {
        setPreset(nextPreset);
        setStepIndex(2);
      }
      return;
    }

    if (stepIndex === 2) {
      if (cursor < TOOLING_OPTIONS.length && (key.return || input === " ")) {
        const nextValue = TOOLING_OPTIONS[cursor].value;
        setTooling((current) => toggleSelection(current, nextValue));
        return;
      }

      if (cursor === TOOLING_OPTIONS.length && (key.return || input === " " || key.rightArrow)) {
        setStepIndex(3);
      }
      return;
    }

    if (stepIndex === 3 && (key.return || input === " ")) {
      const nextSample = SAMPLE_OPTIONS[cursor]?.value;
      if (typeof nextSample === "boolean") {
        setSample(nextSample);
        setStepIndex(4);
      }
      return;
    }

    if (stepIndex === 4 && (key.return || input === " ")) {
      const action = REVIEW_ACTIONS[cursor]?.value;
      if (action === "confirm") {
        onSubmit({ bundler, preset, tooling, sample });
      } else if (action === "back") {
        setStepIndex(3);
      } else if (action === "cancel") {
        onCancel();
      }
    }
  });

  return h(
    Box,
    { flexDirection: "column", paddingX: 1, paddingY: 1 },
    h(
      Box,
      { borderStyle: "single", borderColor: "cyan", paddingX: 1, paddingY: 0, flexDirection: "column" },
      h(Text, { color: "cyan", bold: true }, "Manifesto Init"),
      h(Text, { dimColor: true }, `Step ${stepIndex + 1}/5`),
      renderBody({
        stepIndex,
        cursor,
        bundlerOptions,
        detection,
        bundler,
        preset,
        tooling,
        sample,
        dryRun,
      }),
    ),
    h(
      Box,
      { marginTop: 1, flexDirection: "column" },
      h(Text, { dimColor: true }, "Controls: up/down move, enter select, space toggle, left back, q cancel"),
      h(Text, { dimColor: true }, "Non-interactive mode remains available via --preset, --bundler, --tooling, --no-sample."),
    ),
  );
}

function renderBody({
  stepIndex,
  cursor,
  bundlerOptions,
  detection,
  bundler,
  preset,
  tooling,
  sample,
  dryRun,
}) {
  if (stepIndex === 0) {
    const hint = detection.bundler !== "unknown"
      ? `Detected ${detection.bundler}${detection.evidence ? ` from ${detection.evidence}` : ""}.`
      : "No bundler was detected automatically.";
    return h(
      Box,
      { flexDirection: "column", marginTop: 1 },
      h(Text, { bold: true }, "Choose a bundler"),
      h(Text, { dimColor: true }, hint),
      h(Box, { flexDirection: "column", marginTop: 1 }, ...bundlerOptions.map((option, index) => renderOption({
        key: option.value,
        index,
        cursor,
        label: option.label,
        description: option.description,
        selected: option.value === bundler,
        marker: option.value === bundler ? "(*)" : "( )",
      }))),
    );
  }

  if (stepIndex === 1) {
    return h(
      Box,
      { flexDirection: "column", marginTop: 1 },
      h(Text, { bold: true }, "Choose a runtime preset"),
      h(Text, { dimColor: true }, "This controls which package composition path the CLI will install."),
      h(Box, { flexDirection: "column", marginTop: 1 }, ...PRESET_OPTIONS.map((option, index) => renderOption({
        key: option.value,
        index,
        cursor,
        label: option.label,
        description: option.description,
        selected: option.value === preset,
        marker: option.value === preset ? "(*)" : "( )",
      }))),
    );
  }

  if (stepIndex === 2) {
    return h(
      Box,
      { flexDirection: "column", marginTop: 1 },
      h(Text, { bold: true }, "Choose optional tooling"),
      h(Text, { dimColor: true }, "Toggle any extras you want bundled into the init plan."),
      h(Box, { flexDirection: "column", marginTop: 1 }, ...TOOLING_OPTIONS.map((option, index) => renderOption({
        key: option.value,
        index,
        cursor,
        label: option.label,
        description: option.description,
        selected: tooling.includes(option.value),
        marker: tooling.includes(option.value) ? "[x]" : "[ ]",
      }))),
      renderOption({
        key: "continue",
        index: TOOLING_OPTIONS.length,
        cursor,
        label: "continue",
        description: tooling.length > 0
          ? `Selected: ${tooling.join(", ")}`
          : "No optional tooling selected.",
        selected: false,
        marker: "->",
      }),
    );
  }

  if (stepIndex === 3) {
    return h(
      Box,
      { flexDirection: "column", marginTop: 1 },
      h(Text, { bold: true }, "Sample files"),
      h(Text, { dimColor: true }, "Decide whether init should generate demo MEL/runtime files."),
      h(Box, { flexDirection: "column", marginTop: 1 }, ...SAMPLE_OPTIONS.map((option, index) => renderOption({
        key: String(option.value),
        index,
        cursor,
        label: option.label,
        description: option.description,
        selected: option.value === sample,
        marker: option.value === sample ? "(*)" : "( )",
      }))),
    );
  }

  return h(
    Box,
    { flexDirection: "column", marginTop: 1 },
    h(Text, { bold: true }, "Review the init plan"),
    h(Text, { dimColor: true }, dryRun ? "Dry-run mode will print the plan without applying changes." : "Confirm to build and apply the init plan."),
    h(Box, { flexDirection: "column", marginTop: 1 },
      h(Text, null, `Bundler: ${bundler}`),
      h(Text, null, `Preset: ${preset}`),
      h(Text, null, `Tooling: ${tooling.length > 0 ? tooling.join(", ") : "none"}`),
      h(Text, null, `Sample files: ${sample ? "yes" : "no"}`),
      h(Text, null, `Mode: ${dryRun ? "dry-run" : "apply changes"}`),
    ),
    h(Box, { flexDirection: "column", marginTop: 1 }, ...REVIEW_ACTIONS.map((option, index) => renderOption({
      key: option.value,
      index,
      cursor,
      label: option.label,
      description: option.value === "confirm"
        ? "Proceed with the selections above."
        : option.value === "back"
          ? "Return to the previous step."
          : "Exit without changing anything.",
      selected: false,
      marker: "->",
    }))),
  );
}

function renderOption({
  key,
  index,
  cursor,
  label,
  description,
  selected,
  marker,
}) {
  const active = cursor === index;
  const color = active ? "cyan" : selected ? "green" : undefined;

  return h(
    Box,
    { key, flexDirection: "column", marginTop: index === 0 ? 0 : 1 },
    h(Text, { color, bold: active }, `${active ? ">" : " "} ${marker} ${label}`),
    description ? h(Text, { dimColor: true }, `    ${description}`) : null,
  );
}

function buildBundlerOptions(detection) {
  return BUNDLERS
    .filter((entry) => entry !== "unknown")
    .map((entry) => ({
      value: entry,
      label: entry,
      description: detection.bundler === entry
        ? `Auto-detected${detection.evidence ? ` from ${detection.evidence}` : ""}.`
        : bundlerDescription(entry),
    }));
}

function bundlerDescription(value) {
  switch (value) {
    case "vite":
      return "Best supported path for MVP scaffolding and plugin patching.";
    case "webpack":
      return "Also covers most Next.js-style webpack projects, but may need manual review.";
    case "rollup":
      return "Detection and doctor support are ready; config patching is not automated yet.";
    case "esbuild":
      return "Detection and doctor support are ready; config patching is not automated yet.";
    case "rspack":
      return "Detection and doctor support are ready; config patching is not automated yet.";
    case "node-loader":
      return "Use compiler node-loader wiring instead of a bundler plugin.";
    default:
      return "";
  }
}

function toggleSelection(values, value) {
  if (values.includes(value)) {
    return values.filter((entry) => entry !== value);
  }

  return [...values, value];
}

function dedupeTooling(values) {
  return Array.from(new Set(values.filter((entry) => TOOLING_KEYS.includes(entry))));
}

function maxCursorForStep(stepIndex) {
  switch (stepIndex) {
    case 0:
      return BUNDLERS.filter((entry) => entry !== "unknown").length - 1;
    case 1:
      return PRESET_OPTIONS.length - 1;
    case 2:
      return TOOLING_OPTIONS.length;
    case 3:
      return SAMPLE_OPTIONS.length - 1;
    default:
      return REVIEW_ACTIONS.length - 1;
  }
}

function defaultCursorForStep(stepIndex, state) {
  if (stepIndex === 0) {
    return Math.max(0, state.bundlerOptions.findIndex((entry) => entry.value === state.bundler));
  }
  if (stepIndex === 1) {
    return Math.max(0, PRESET_OPTIONS.findIndex((entry) => entry.value === state.preset));
  }
  if (stepIndex === 3) {
    return Math.max(0, SAMPLE_OPTIONS.findIndex((entry) => entry.value === state.sample));
  }
  return 0;
}
