import React, { useEffect, useMemo, useState } from "react";
import { Box, Text, render, useInput } from "ink";
import { readManifestoConfig } from "../lib/config.js";
import { detectBundler } from "../lib/project.js";

const h = React.createElement;

const RUNTIME_OPTIONS = [
  ["base", "base runtime", "Install sdk + compiler only."],
  ["lineage", "lineage runtime", "Add lineage on top of the base runtime."],
  ["gov", "gov runtime", "Add lineage + governance on top of the base runtime."],
];

const INTEGRATION_OPTIONS = [
  ["none", "no integration", "Do not patch vite, webpack, or node-loader right now."],
  ["vite", "vite", "Use @manifesto-ai/compiler/vite."],
  ["webpack", "webpack", "Use @manifesto-ai/compiler/webpack."],
  ["rollup", "rollup", "Use @manifesto-ai/compiler/rollup."],
  ["esbuild", "esbuild", "Use @manifesto-ai/compiler/esbuild."],
  ["rspack", "rspack", "Use @manifesto-ai/compiler/rspack."],
  ["node-loader", "node-loader", "Add a node --loader example script."],
];

const CODEGEN_OPTIONS = [
  ["off", "off", "Do not install @manifesto-ai/codegen."],
  ["install", "install only", "Install @manifesto-ai/codegen without wiring it."],
  ["wire", "wire", "Install and wire codegen into the selected integration."],
];

const SKILLS_OPTIONS = [
  ["off", "off", "Do not install @manifesto-ai/skills."],
  ["install", "install only", "Install @manifesto-ai/skills without Codex setup."],
  ["codex", "codex", "Install @manifesto-ai/skills and run Codex setup."],
];

const SAMPLE_OPTIONS = [
  ["none", "none", "Do not generate sample MEL or runtime files."],
  ["counter", "counter sample", "Generate the counter MEL sample and starter runtime."],
];

const REVIEW_ACTIONS = [
  ["confirm", "apply init", "Write config, install packages, and run any selected setup steps."],
  ["back", "go back", "Return to the previous step."],
  ["cancel", "cancel", "Exit without changing the project."],
];

export async function runInitWizard({
  runtime,
  integration,
  codegen,
  skills,
  sample,
  dryRun,
  cwd,
}) {
  const configRecord = await readManifestoConfig(cwd);
  const detection = detectBundler(cwd);
  const currentConfig = configRecord?.config ?? null;

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
      currentConfig,
      detection,
      initialRuntime: runtime ?? currentConfig?.runtime ?? "base",
      initialIntegration: integration ?? currentConfig?.integration.mode ?? "none",
      initialCodegen: codegen ?? currentConfig?.tooling.codegen ?? "off",
      initialSkills: skills ?? currentConfig?.tooling.skills ?? "off",
      initialSample: sample ?? currentConfig?.sample ?? "none",
      dryRun,
      onSubmit: finish,
      onCancel: () => finish(null),
    }));
  });
}

function InitWizardApp({
  currentConfig,
  detection,
  initialRuntime,
  initialIntegration,
  initialCodegen,
  initialSkills,
  initialSample,
  dryRun,
  onSubmit,
  onCancel,
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [cursor, setCursor] = useState(0);
  const [runtime, setRuntime] = useState(initialRuntime);
  const [integration, setIntegration] = useState(initialIntegration);
  const [codegen, setCodegen] = useState(initialCodegen);
  const [skills, setSkills] = useState(initialSkills);
  const [sample, setSample] = useState(initialSample);

  const stepOptions = useMemo(() => ([
    RUNTIME_OPTIONS,
    INTEGRATION_OPTIONS,
    CODEGEN_OPTIONS,
    SKILLS_OPTIONS,
    SAMPLE_OPTIONS,
    REVIEW_ACTIONS,
  ]), []);

  useEffect(() => {
    setCursor(defaultCursorForStep(stepIndex, {
      runtime,
      integration,
      codegen,
      skills,
      sample,
    }));
  }, [stepIndex, runtime, integration, codegen, skills, sample]);

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

    const maxIndex = stepOptions[stepIndex].length - 1;
    if (key.downArrow || input === "j") {
      setCursor((current) => Math.min(current + 1, maxIndex));
      return;
    }

    if (key.upArrow || input === "k") {
      setCursor((current) => Math.max(current - 1, 0));
      return;
    }

    if (!(key.return || input === " ")) {
      return;
    }

    const value = stepOptions[stepIndex][cursor]?.[0];

    switch (stepIndex) {
      case 0:
        setRuntime(value);
        setStepIndex(1);
        return;
      case 1:
        setIntegration(value);
        if (value === "none" && codegen === "wire") {
          setCodegen("install");
        }
        setStepIndex(2);
        return;
      case 2:
        if (value === "wire" && (integration === "none" || integration === "node-loader")) {
          return;
        }
        setCodegen(value);
        setStepIndex(3);
        return;
      case 3:
        setSkills(value);
        setStepIndex(4);
        return;
      case 4:
        setSample(value);
        setStepIndex(5);
        return;
      default:
        if (value === "confirm") {
          onSubmit({ runtime, integration, codegen, skills, sample });
        } else if (value === "back") {
          setStepIndex(4);
        } else {
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
      h(Text, { dimColor: true }, `Step ${stepIndex + 1}/6`),
      renderBody({
        stepIndex,
        cursor,
        currentConfig,
        detection,
        runtime,
        integration,
        codegen,
        skills,
        sample,
        dryRun,
      }),
    ),
    h(
      Box,
      { marginTop: 1, flexDirection: "column" },
      h(Text, { dimColor: true }, "Controls: up/down move, enter select, left back, q cancel"),
      h(Text, { dimColor: true }, "Defaults are intentionally conservative: install-only, no integration, no sample."),
    ),
  );
}

function renderBody({
  stepIndex,
  cursor,
  currentConfig,
  detection,
  runtime,
  integration,
  codegen,
  skills,
  sample,
  dryRun,
}) {
  const header = currentConfig
    ? "Existing manifesto.config was detected. The wizard starts from that intent."
    : "No manifesto.config found. Starting from the install-only baseline.";

  if (stepIndex === 0) {
    return renderOptionsScreen({
      title: "Choose a runtime",
      description: header,
      cursor,
      options: RUNTIME_OPTIONS,
      selectedValue: runtime,
    });
  }

  if (stepIndex === 1) {
    const detectionText = detection.bundler !== "unknown"
      ? `Detected ${detection.bundler}${detection.evidence ? ` from ${detection.evidence}` : ""}.`
      : "No integration surface was detected automatically.";
    return renderOptionsScreen({
      title: "Choose an integration mode",
      description: `${detectionText} "none" is the default when you only want packages and config intent.`,
      cursor,
      options: INTEGRATION_OPTIONS,
      selectedValue: integration,
    });
  }

  if (stepIndex === 2) {
    const codegenHint = integration === "none"
      ? 'Select "install only" if you want @manifesto-ai/codegen without patching a host.'
      : integration === "node-loader"
        ? 'node-loader supports install-only today. "wire" is disabled for this integration.'
        : `Codegen can wire into ${integration}.`;
    return renderOptionsScreen({
      title: "Choose a codegen mode",
      description: codegenHint,
      cursor,
      options: CODEGEN_OPTIONS,
      selectedValue: codegen,
      disabledValues: new Set(
        integration === "none" || integration === "node-loader"
          ? ["wire"]
          : [],
      ),
    });
  }

  if (stepIndex === 3) {
    return renderOptionsScreen({
      title: "Choose a skills mode",
      description: "Skills can stay install-only or run the Codex setup path immediately.",
      cursor,
      options: SKILLS_OPTIONS,
      selectedValue: skills,
    });
  }

  if (stepIndex === 4) {
    return renderOptionsScreen({
      title: "Choose a sample mode",
      description: "Samples are optional and should not be created by default in existing projects.",
      cursor,
      options: SAMPLE_OPTIONS,
      selectedValue: sample,
    });
  }

  return h(
    Box,
    { flexDirection: "column", marginTop: 1 },
    h(Text, { bold: true }, `Review${dryRun ? " (dry-run)" : ""}`),
    h(Text, null, `runtime: ${runtime}`),
    h(Text, null, `integration: ${integration}`),
    h(Text, null, `codegen: ${codegen}`),
    h(Text, null, `skills: ${skills}`),
    h(Text, null, `sample: ${sample}`),
    h(Text, { dimColor: true }, "init will write manifesto.config.ts every time and apply only the selected actions."),
    h(Box, { flexDirection: "column", marginTop: 1 }, ...REVIEW_ACTIONS.map(([value, label, description], index) => renderOption({
      key: value,
      index,
      cursor,
      label,
      description,
      selected: false,
      marker: "·",
      disabled: false,
    }))),
  );
}

function renderOptionsScreen({ title, description, cursor, options, selectedValue, disabledValues = new Set() }) {
  return h(
    Box,
    { flexDirection: "column", marginTop: 1 },
    h(Text, { bold: true }, title),
    h(Text, { dimColor: true }, description),
    h(
      Box,
      { flexDirection: "column", marginTop: 1 },
      ...options.map(([value, label, optionDescription], index) => renderOption({
        key: value,
        index,
        cursor,
        label,
        description: optionDescription,
        selected: value === selectedValue,
        marker: value === selectedValue ? "(*)" : "( )",
        disabled: disabledValues.has(value),
      })),
    ),
  );
}

function renderOption({ key, index, cursor, label, description, selected, marker, disabled }) {
  const active = index === cursor;
  const prefix = active ? "›" : " ";
  const color = disabled ? "gray" : active ? "cyan" : undefined;
  const suffix = disabled ? " [disabled]" : "";

  return h(
    Box,
    { key, flexDirection: "column", marginBottom: 0 },
    h(Text, { color, dimColor: disabled, bold: active }, `${prefix} ${marker} ${label}${selected ? " [selected]" : ""}${suffix}`),
    h(Text, { dimColor: true }, `    ${description}`),
  );
}

function defaultCursorForStep(stepIndex, state) {
  switch (stepIndex) {
    case 0:
      return indexOfValue(RUNTIME_OPTIONS, state.runtime);
    case 1:
      return indexOfValue(INTEGRATION_OPTIONS, state.integration);
    case 2:
      return indexOfValue(CODEGEN_OPTIONS, state.codegen);
    case 3:
      return indexOfValue(SKILLS_OPTIONS, state.skills);
    case 4:
      return indexOfValue(SAMPLE_OPTIONS, state.sample);
    default:
      return 0;
  }
}

function indexOfValue(options, value) {
  const index = options.findIndex(([candidate]) => candidate === value);
  return index >= 0 ? index : 0;
}
