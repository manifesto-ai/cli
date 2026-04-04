# PRD: `@manifesto-ai/cli`

## 0. 문서 정보

| 항목 | 값 |
|------|-----|
| 문서명 | PRD — `@manifesto-ai/cli` |
| 버전 | 0.2.0-draft |
| 작성일 | 2026-04-04 |
| 작성 목적 | Manifesto 생태계 설치·설정·점검·확장을 위한 공식 CLI 정의 |
| 대상 | Manifesto Core 팀, DX/Docs, Studio/Skills/LSP 연동 담당자 |

---

## 1. 한 줄 정의

`@manifesto-ai/cli`는 Manifesto의 런타임, 컴파일러, 도구 패키지들을 **하나의 일관된 설치·설정·검증 흐름**으로 묶는 공식 CLI다.

---

## 2. 배경

Manifesto는 현재 패키지 수준에서는 꽤 건강하다.

`sdk`, `compiler`, `core`, `host`, `codegen`, `lineage`, `governance`, `skills` 등 책임이 분리되어 있고, API 문서도 base runtime과 governed composition을 구분한다. 이건 아키텍처적으로 맞다.

문제는 사용자가 이 구조를 **직접 조립해야 한다는 점**이다.

README는 기본 설치를 `sdk + compiler`로 제시하고, API 문서도 SDK를 시작점으로 둔다. 그러나 실제 사용자 여정은 거기서 끝나지 않는다. bundler 설정, MEL plugin 연결, 선택적 lineage/governance 조합, codegen 설정, skills 설치, 향후 studio/lsp 연동까지 이어진다.

즉, 지금의 문제는 "패키지가 많다"가 아니다.
**설치 단위와 사용자의 목표 단위가 어긋나기 시작했다.**

사용자(인간이든 AI 에이전트든)는 이런 질문을 하지 않는다:

- `sdk`를 먼저 깔아야 하나?
- `compiler`는 devDependency인가?
- `lineage`와 `governance`는 언제 붙이나?
- `codegen`의 `createCompilerCodegen()`은 어떻게 주입하나?

사용자는 이런 질문을 한다:

- "Manifesto를 내 프로젝트에 붙이고 싶다."
- "governed runtime을 쓰고 싶다."
- "AI tooling까지 같이 붙이고 싶다."
- "내 프로젝트 상태가 정상인지 알고 싶다."

필요한 것은 새 런타임이 아니라 **공식 조정면(control surface)** 이다.

---

## 3. 문제 정의

### 3.1 첫 성공까지의 경로가 길다

사용자는 `sdk`와 `compiler`를 설치하고, bundler에 `melPlugin()`을 연결하고, 샘플 MEL을 만들고, 런타임 코드를 작성해야 한다. 이 흐름은 기술적으로는 단순하지만, 심리적으로는 "뭘 빠뜨렸는지 모르는 상태"를 만든다. AI 에이전트에게는 더 심하다 — context window에 올바른 설치 순서가 없으면 hallucinate한다.

### 3.2 선택적 확장의 "선택 기준"이 불명확하다

현재 문서 구조는 base runtime과 governed composition을 잘 구분한다. 하지만 실제 사용자는 언제 lineage/governance를 붙여야 하는지, 무엇이 필수이고 무엇이 선택인지 헷갈릴 수 있다. ADR-017이 정의한 `createManifesto → withLineage → withGovernance → activate` 순서는 타입 시스템에서 강제되지만, 패키지 설치 수준에서는 보이지 않는다.

### 3.3 도구성 패키지들이 런타임 바깥에 분리돼 있다

이건 구조적으로는 옳다. 다만 사용자 입장에서는 "codegen은 선택적 주입", "skills 설치는 별도 명령(`manifesto-skills install-codex`)", "향후 studio/lsp는 또 별도 설정"으로 느껴진다. 특히 skills는 명시적 설치 모델을 택하고 있어 자동 설치보다 안전하지만, 그만큼 "놓치기 쉬운 단계"가 된다.

### 3.4 문서가 정답이어도, 프로젝트 상태는 드리프트한다

문서를 따라 한 번 성공한 뒤에도 프로젝트는 쉽게 불일치 상태가 된다:

- compiler는 있는데 bundler plugin 설정이 빠짐
- governed 의도인데 패키지 조합이 비완성 (lineage 없이 governance만 설치)
- codegen emitter가 설정됐지만 `@manifesto-ai/codegen` 패키지가 없음
- skills는 설치했지만 후처리(`install-codex`)가 안 됨
- 패키지 버전 간 호환성이 어긋남

이 문제는 문서만으로 해결되지 않는다. **검사 도구**가 필요하다.

---

## 4. 제품 가설

Manifesto는 "패키지 수를 줄이면" DX가 좋아지는 생태계가 아니다.
Manifesto는 "패키지 간 책임을 유지한 채, 사용자의 작업 흐름을 하나로 묶으면" DX가 좋아지는 생태계다.

따라서 `@manifesto-ai/cli`의 목표는 다음이 아니다:

- 하나의 메타 패키지로 모든 것을 뭉개기
- 현재 패키지 구조를 숨기기
- 새로운 아키텍처 레이어를 추가하기

목표는 이것이다:

> **분리된 생태계를 유지하면서, 사용자가 올바른 조합으로 빠르게 시작하고 안전하게 확장하게 만든다.**

---

## 5. 목표와 비목표

### 5.1 목표

1. **첫 성공까지의 시간을 줄인다.** 새 사용자(인간 또는 AI 에이전트)가 최소한의 입력만으로 Manifesto를 기존 프로젝트에 주입할 수 있어야 한다.

2. **생태계 조합을 의도 기반으로 노출한다.** 사용자는 패키지명이 아니라 목적을 선택해야 한다.

3. **설치 이후의 상태를 검사할 수 있어야 한다.** CLI는 단순한 scaffold 도구가 아니라, 프로젝트의 정합성을 점검하는 운영 도구여야 한다.

4. **점진적 확장을 지원한다.** 처음부터 full bundle을 강요하지 않고, 필요한 기능만 순차적으로 붙일 수 있어야 한다.

5. **공식 문서의 구조를 깨지 않는다.** SDK가 공식 엔트리라는 현재 구조, governed composition의 선택적 방향, skills의 explicit setup 철학을 유지해야 한다.

6. **인간과 AI 에이전트 모두를 1급 사용자로 다룬다.** 모든 interactive flow에는 대응하는 non-interactive 경로가 존재해야 한다.

### 5.2 비목표

1. `@manifesto-ai/sdk`를 대체하지 않는다.
2. `@manifesto-ai/compiler`를 숨기거나 폐기하지 않는다.
3. 모든 패키지를 한 개의 런타임 패키지로 합치지 않는다.
4. CLI가 framework-specific magic을 무제한으로 품지 않는다.
5. Studio, LSP, Skills 각각의 독립적 책임을 침범하지 않는다.
6. `manifesto new`를 통한 full project scaffold를 제공하지 않는다. **Manifesto는 호스트 환경에 주입되는 코어이지, 호스트 환경을 생성하는 도구가 아니다.** BE, FE, Agent 등 호스트 환경의 선택은 사용자에게 속한다.

---

## 6. 타겟 사용자

### 6.1 신규 앱 개발자 (인간)

Manifesto를 처음 접하고, MEL + runtime까지 최소 경로로 붙이고 싶은 개발자. interactive prompt를 통해 안내받는 경로.

### 6.2 AI 에이전트

Claude Code, Codex, 또는 기타 LLM 기반 도구가 Manifesto 프로젝트를 설정하는 경우. `--preset`, `--non-interactive` flag를 통한 deterministic 경로. context window에 CLI 명령 한 줄만 있으면 올바른 프로젝트 상태에 도달할 수 있어야 한다.

### 6.3 Governed runtime 사용자

lineage / governance를 포함한 더 강한 실행 모델을 시작하려는 사용자. 조합 순서(lineage → governance)를 이해한 상태에서 점진적으로 확장하는 경로.

### 6.4 팀/조직 사용자

여러 프로젝트에서 동일한 Manifesto 설정 품질을 유지하고 싶은 사용자. `doctor`를 CI에 넣어 정합성을 자동 검증하는 경로.

---

## 7. 핵심 Jobs To Be Done

### JTBD 1 — 시작

"나는 기존 프로젝트에 Manifesto를 붙이고 싶다. 그래서 내 빌드 시스템에 맞는 패키지와 설정을 한 번에 맞추고 바로 첫 intent를 실행하고 싶다."

### JTBD 2 — 확장

"나는 governed runtime이나 tooling을 나중에 추가하고 싶다. 그래서 현재 구조를 깨지 않고 필요한 것만 점진적으로 붙이고 싶다."

### JTBD 3 — 검증

"나는 내 프로젝트가 지금 정상 상태인지 알고 싶다. 그래서 문서를 다시 읽지 않고도 누락과 불일치를 확인하고 싶다."

### JTBD 4 — 자동화

"나는 AI 에이전트가 Manifesto 프로젝트를 정확하게 셋업하게 만들고 싶다. 그래서 interactive 질문 없이 한 줄 명령으로 결정적 결과를 얻고 싶다."

---

## 8. 제품 원칙

### 8.1 구조를 감추지 말고, 조립을 대신하라

Manifesto의 강점은 분리된 계층이다. CLI는 이 구조를 감춰서 마법처럼 보이게 하면 안 된다. 대신 **안전한 기본 조합**을 제공한다.

구체적으로: CLI가 설치한 패키지 목록, 변경한 파일 목록, 실행한 명령은 항상 사용자에게 보여야 한다.

### 8.2 명시적 설정을 유지하되, 반복 입력은 줄인다

skills가 explicit setup을 택한 것은 옳다. CLI도 같은 철학을 가져야 한다. 자동화는 하되, 사용자가 모르는 사이에 무언가를 과도하게 숨겨서 설치하면 안 된다. 특히 **의존 패키지 자동 해결은 하지 않는다** — 왜 그 의존이 필요한지 설명하고 사용자가 직접 추가하게 안내한다.

### 8.3 첫 성공과 장기 유지 둘 다 책임진다

좋은 DX는 `init`에서만 끝나지 않는다. Manifesto는 프로젝트가 자라면서 package drift, config drift가 생기기 쉽다. CLI는 설치 순간뿐 아니라 **운영 순간**도 책임져야 한다.

### 8.4 의도 기반 UX를 제공한다

사용자는 `lineage`라는 패키지를 추가하고 싶은 게 아니라, "governed runtime"을 쓰고 싶은 것이다. CLI는 의도를 패키지 조합으로 번역한다.

### 8.5 인간과 에이전트는 같은 기능, 다른 인터페이스

모든 interactive flow에는 1:1 대응하는 non-interactive flag set이 존재한다. 기능 차이는 없고, 인터페이스만 다르다.

---

## 9. 제품 범위

### 9.1 MVP (v1.0)

#### 명령 1: `manifesto init`

기존 프로젝트에 Manifesto를 주입하는 초기화 명령.

역할:

- 현재 프로젝트의 빌드 시스템 탐지
- 필요한 패키지 설치 (sdk, compiler + 선택 패키지)
- bundler plugin 설정 반영
- 샘플 MEL / 샘플 runtime 코드 생성
- optional tooling 선택 반영

#### 명령 2: `manifesto add <capability>`

선택 기능 추가.

예시:

- `manifesto add lineage`
- `manifesto add governance`
- `manifesto add codegen`
- `manifesto add skills`

역할:

- 관련 패키지 설치
- 필요한 설정 파일 추가/수정
- 샘플 또는 연결 코드 주입
- 선행 의존 누락 시 **안내 (자동 설치 아님)**
- `--dry-run`으로 변경 예정만 출력 가능

#### 명령 3: `manifesto doctor`

프로젝트 상태 진단.

역할:

- 설치 패키지 확인
- 패키지 버전 호환성 확인
- bundler plugin 설정 검사
- 조합 정합성 검사 (governance 있는데 lineage 없음 등)
- skills 후처리 상태 검사
- 수정 제안 출력
- `--json` 출력으로 CI 통합 지원

### 9.2 v1.1 이후 후보

| 명령 | 역할 |
|------|------|
| `manifesto sync` | 설정 파일 기준으로 현재 프로젝트 상태 정렬 |
| `manifesto migrate` | 버전 업그레이드나 설정 구조 변경 시 codemod/patch 지원 |
| `manifesto info` | 현재 프로젝트의 Manifesto 설정 요약 출력 |

---

## 10. 패키지 정체성

### 공식 패키지명

```
@manifesto-ai/cli
```

### 공식 실행 명령

```
manifesto
```

이 설계가 적합한 이유는, 이 도구의 책임이 특정 기능이 아니라 **생태계 전체의 작업 흐름 제어**이기 때문이다. 현재 패키지 체계 역시 `@manifesto-ai/<role>` 패턴으로 정렬돼 있으므로 naming 일관성도 높다.

---

## 11. UX 설계

### 11.1 `manifesto init`

#### Interactive 경로 (인간)

```bash
manifesto init
```

CLI가 묻는 최소 질문:

1. **빌드 시스템** — auto-detect 우선, 확인 요청
    - vite / webpack / rollup / esbuild / rspack / node-loader / unknown
    - 탐지 기준: `vite.config.*`, `webpack.config.*`, `rollup.config.*`, `next.config.*`, `rspack.config.*`, `package.json`의 build scripts
    - **프레임워크(React, Next 등)가 아닌 빌드 시스템을 기준으로 탐지한다.** Manifesto는 호스트 환경의 코어이므로, compiler의 subpath exports(`@manifesto-ai/compiler/vite` 등)가 실제 integration 단위다.

2. **사용 의도**
    - base runtime
    - governed runtime (lineage + governance)

3. **tooling 선택** (multi-select)
    - codegen
    - skills
    - (향후: studio, lsp)

출력 결과:

- 설치된 패키지 목록 (dependency vs devDependency 구분)
- 변경된 파일 목록 (diff 형태)
- 다음 실행 명령 안내
- `manifesto doctor` 실행 권장

#### Non-interactive 경로 (에이전트)

```bash
manifesto init --preset base --bundler vite
manifesto init --preset governed --bundler webpack --tooling codegen,skills
manifesto init --preset base --bundler node-loader --no-sample
```

설계 규칙:

- `--preset`은 interactive 질문 2(사용 의도)의 대응물이다.
- `--bundler`는 auto-detect를 건너뛴다.
- `--tooling`은 comma-separated list다.
- `--no-sample`은 샘플 MEL/runtime 코드 생성을 건너뛴다.
- **모든 interactive 질문에 대응하는 flag가 존재해야 한다.** flag가 하나라도 빠지면 interactive prompt가 뜨고, 에이전트는 거기서 멈춘다.

### 11.2 `manifesto add`

```bash
manifesto add governance
```

동작:

1. governance는 lineage 위에서만 작동한다. (ADR-017: `withGovernance()`의 input 타입이 `LineageComposableManifestoInput<T>`)
2. lineage가 없으면 **자동 설치하지 않는다.**
3. 대신 안내한다:

```
✗ governance requires lineage.

  In Manifesto, governance adds legitimacy to a world that already has
  continuity. Without lineage, there is no history to govern.

  Run first:  manifesto add lineage
  Then retry:  manifesto add governance
```

이 설계의 근거: ADR-017의 존재론에서 lineage는 "시간과 연속성"이고 governance는 "정당성"이다. 사용자가 그 의미를 이해하지 않은 채 자동으로 깔리면, §8.1("구조를 감추지 말고 조립을 대신하라")을 위반한다.

에이전트용 escape hatch: `--auto-deps` flag를 제공하되, 설치된 의존과 그 이유를 stdout에 출력한다.

```bash
manifesto add governance --auto-deps
# → Installing @manifesto-ai/lineage (required by governance — continuity before legitimacy)
# → Installing @manifesto-ai/governance
```

#### Skills의 특수 처리

```bash
manifesto add skills
```

동작:

1. `@manifesto-ai/skills` 패키지 설치
2. 후속 단계를 **안내하되 자동 실행하지 않는다:**

```
✓ @manifesto-ai/skills installed.

  Skills uses explicit setup by design.
  Next steps depend on your tooling:

    Codex:       pnpm exec manifesto-skills install-codex
    Claude Code: Reference @node_modules/@manifesto-ai/skills/SKILL.md in CLAUDE.md
```

이 설계의 근거: Constitution에서 skills는 "postinstall이 아니라 explicit setup"을 택했다. CLI가 이 과정을 자동화하면 skills의 설계 의도를 우회한다. skills 쪽에서 CLI integration point를 공식 노출할 때까지, CLI는 설치 + 안내로 제한한다.

### 11.3 `manifesto doctor`

예상 출력:

```
manifesto doctor

  Packages
    ✓ @manifesto-ai/sdk@3.0.0
    ✓ @manifesto-ai/compiler@0.7.0 (devDependency)
    ✓ @manifesto-ai/lineage@3.0.0
    ✓ @manifesto-ai/governance@3.3.0

  Bundler Integration
    ✓ vite detected (vite.config.ts)
    ✓ melPlugin() configured

  Composition Integrity
    ✓ governance requires lineage — present
    ✓ codegen emitter configured — @manifesto-ai/codegen present

  Compatibility
    ✓ sdk@3.0.0 ↔ core@4.0.0 ↔ host@4.0.0 — compatible
    ✓ lineage@3.0.0 ↔ governance@3.3.0 — compatible

  Skills
    ⚠ @manifesto-ai/skills installed, but codex setup not detected
      → Run: pnpm exec manifesto-skills install-codex

  3 checks passed, 1 warning, 0 errors
```

CI 통합:

```bash
manifesto doctor --json
# → { "passed": 3, "warnings": 1, "errors": 0, "checks": [...] }

manifesto doctor --strict
# → warnings를 errors로 승격, exit code 1
```

---

## 12. Doctor 규칙 소싱 전략

`doctor`가 "Manifesto의 조합 규칙을 안다"고 하려면, 그 규칙을 **어디서 읽어오는지** 명확해야 한다. CLI가 도메인 의미를 소유하지 않는다는 원칙(§13.2)을 지키려면, 규칙은 CLI에 하드코딩되면 안 된다.

### MVP 전략: Capability Manifest

각 패키지가 `package.json`의 `manifesto` 필드에 machine-readable 메타데이터를 노출한다.

```jsonc
// @manifesto-ai/governance/package.json
{
  "manifesto": {
    "capability": "governance",
    "requires": ["lineage"],
    "provides": ["proposeAsync", "approve", "reject"],
    "compatibleWith": {
      "sdk": ">=3.0.0",
      "lineage": ">=3.0.0"
    }
  }
}
```

```jsonc
// @manifesto-ai/compiler/package.json
{
  "manifesto": {
    "capability": "compiler",
    "bundlerIntegration": {
      "vite": "@manifesto-ai/compiler/vite",
      "webpack": "@manifesto-ai/compiler/webpack",
      "rollup": "@manifesto-ai/compiler/rollup",
      "esbuild": "@manifesto-ai/compiler/esbuild",
      "rspack": "@manifesto-ai/compiler/rspack",
      "node-loader": "@manifesto-ai/compiler/node-loader"
    },
    "optionalPeers": {
      "codegen": "@manifesto-ai/codegen"
    }
  }
}
```

Doctor는 이 필드를 읽어서 규칙을 도출한다:

- `governance.requires` 에 `lineage`가 있으면 → lineage 설치 여부 검사
- `compiler.bundlerIntegration` 에 bundler별 subpath가 있으면 → 해당 plugin 설정 검사
- `governance.compatibleWith.sdk >= 3.0.0` 이면 → 설치된 sdk 버전 비교

이 전략의 장점:

- **규칙의 소유권이 각 패키지에 있다.** CLI가 아닌 패키지가 자기 의존성과 호환성을 선언한다.
- **CLI는 선언을 읽고 검증하는 해석기에 머문다.** 도메인 의미를 소유하지 않는다.
- **새 패키지가 추가되면 자동으로 doctor에 반영된다.** CLI를 릴리스하지 않아도 된다.

### MVP에서 필요한 패키지측 변경

각 Manifesto 패키지의 `package.json`에 `manifesto` 필드를 추가해야 한다. 이건 breaking change가 아니라 additive change이므로 patch 버전에서 가능하다.

### 대안: CLI에 규칙 하드코딩 (채택하지 않음)

간단하지만, SPEC이 바뀔 때마다 CLI도 릴리스해야 한다. Manifesto처럼 패키지 버전이 독립적으로 움직이는 생태계에서는 동기화 비용이 급격히 커진다.

---

## 13. 설정 모델

### `manifesto.config.ts`의 역할과 한계

이 파일은 **`init` 시점의 scaffold 힌트이자 `doctor`의 기대값 선언**이다.

```ts
// manifesto.config.ts
export default {
  bundler: "vite",
  capabilities: ["lineage", "governance"],
  tooling: {
    codegen: true,
    skills: true,
  },
};
```

**이 파일이 하는 것:**

- `init`의 선택 결과를 기록한다.
- `add`가 변경 후 반영한다.
- `doctor`가 "사용자의 의도"와 "실제 설치 상태"를 비교할 때 기준으로 사용한다.
- 미래의 `sync`, `migrate`의 입력이 된다.

**이 파일이 하지 않는 것:**

- 런타임에 참조되지 않는다. Manifesto의 런타임 진실은 코드(`createManifesto → withLineage → withGovernance → activate`)다.
- 코드의 의미론을 검증하지 않는다. `capabilities: ["governed"]`인데 코드에서 `withGovernance()`를 호출하지 않는 상태를 doctor가 잡으려 하면 안 된다. 그건 정적 분석의 영역이고, CLI의 scope 밖이다.
- 패키지별 SPEC을 대체하지 않는다.

**한 문장으로:** `manifesto.config.ts`는 "사용자가 원하는 프로젝트 상태"를 선언하고, `doctor`는 "실제 설치 상태"와 비교한다. 런타임 코드의 의미론은 검증 대상이 아니다.

---

## 14. 기술 설계 방향

### 14.1 CLI가 소유하는 것

- 프로젝트 빌드 시스템 탐지
- 패키지 설치 orchestration (`npm`, `pnpm`, `yarn` auto-detect)
- bundler 설정 파일 생성/수정
- `manifesto.config.ts` 관리
- 진단 규칙 해석 (패키지의 capability manifest 기반)
- 변경 내역 출력

### 14.2 각 패키지가 계속 소유하는 것

| 패키지 | 소유 범위 |
|--------|----------|
| sdk | `createManifesto()`, 런타임 public entry |
| compiler | MEL compile, bundler plugin integration, subpath exports |
| core / host | compute/apply, effect execution |
| lineage | `withLineage()`, seal-aware continuity |
| governance | `withGovernance()`, proposal lifecycle |
| codegen | schema-driven code generation, plugin pipeline |
| skills | agent-specific installer/guide surface |
| studio / lsp | 각자 독립 도구 기능 |

**CLI는 도메인 의미를 소유하지 않는다. CLI는 조합과 운영 흐름을 소유한다.**

### 14.3 빌드 시스템 탐지 로직

탐지는 **프레임워크가 아닌 bundler 기준**이다. Manifesto는 BE/FE/Agent의 코어로 들어가므로, React/Vue/Svelte 같은 프레임워크는 CLI의 관심사가 아니다. compiler의 subpath exports가 실제 integration 단위이고, CLI는 그것에 정렬한다.

| 탐지 대상 | 탐지 방법 | compiler subpath |
|----------|----------|-----------------|
| Vite | `vite.config.*` | `@manifesto-ai/compiler/vite` |
| Webpack | `webpack.config.*` 또는 `next.config.*` | `@manifesto-ai/compiler/webpack` |
| Rollup | `rollup.config.*` | `@manifesto-ai/compiler/rollup` |
| esbuild | esbuild config 또는 build script 분석 | `@manifesto-ai/compiler/esbuild` |
| Rspack | `rspack.config.*` | `@manifesto-ai/compiler/rspack` |
| Node (ESM) | 위 모두 없고 `type: "module"` | `@manifesto-ai/compiler/node-loader` |

탐지 실패 시: `unknown`으로 처리하고, 사용자에게 bundler를 직접 선택하게 한다. 에이전트 경로에서는 `--bundler` flag 필수.

---

## 15. 왜 메타 패키지가 아니라 CLI인가

### 15.1 구조가 흐려진다

메타 패키지 `@manifesto-ai/full`은 사용자가 어떤 책임이 런타임이고 어떤 책임이 도구인지 구분하지 못하게 만든다.

### 15.2 의존성이 과하게 커진다

skills, studio, lsp, runtime을 한데 묶으면 설치 비용과 유지 비용이 커진다.

### 15.3 확장 경로가 불안정해진다

지금은 좋아 보여도, 나중에 어느 도구를 분리하거나 교체하기 어려워진다.

### 15.4 에이전트에게 메타 패키지는 의미가 없다

AI 에이전트에게는 "한 번에 설치할 수 있는가"보다 "설치 결과가 결정적인가"가 중요하다. 메타 패키지는 불필요한 패키지까지 설치하므로 context를 오히려 오염시킨다. CLI + preset은 정확히 필요한 것만 설치한다.

---

## 16. 성공 지표

### 16.1 측정 가능한 지표

Manifesto의 현재 규모(alpha tester ~10명)를 고려해, telemetry가 아닌 **관찰 가능한 지표**로 설정한다:

- `manifesto init` 후 `manifesto doctor`가 error 0으로 통과하는 비율 (alpha tester 피드백)
- 외부 사용자의 첫 PR/샘플 프로젝트 생성 시간 (before/after CLI)
- Coin Sapiens 등 내부 프로젝트에서 CLI 경로로 전환한 후의 설정 오류 발생 빈도
- AI 에이전트(Claude Code)가 `--preset` 경로로 설정한 프로젝트의 doctor 통과율

### 16.2 정성 지표

- "뭘 설치해야 할지 모르겠다" 피드백 감소
- "문서대로 했는데 왜 안 되지?" 피드백 감소
- 에이전트가 hallucinate한 설치 경로를 생성하는 빈도 감소

---

## 17. 주요 리스크

### 17.1 CLI가 너무 많은 도메인 지식을 품게 될 위험

**심각도:** 높음

**완화책:** Capability Manifest(§12) 도입. 규칙의 소유권은 각 패키지에, CLI는 해석기에 머문다.

### 17.2 빌드 시스템별 예외가 늘어날 위험

**심각도:** 중간

**완화책:** MVP에서는 Vite 우선 지원. 나머지는 점진적 추가. 탐지 실패 시 graceful fallback.

### 17.3 설정 파일이 또 하나의 부채가 될 위험

**심각도:** 중간

**완화책:** `manifesto.config.ts`는 scaffold 힌트 + doctor 기대값으로 제한(§13). 런타임 참조 금지. 파일이 없어도 doctor는 패키지 상태만으로 기본 검사 가능.

### 17.4 문서와 CLI가 어긋날 위험

**심각도:** 높음

**완화책:** Capability Manifest를 패키지가 소유하므로, 패키지 릴리스와 doctor 규칙이 자동 동기화된다. CLI 자체의 릴리스 주기는 패키지와 독립적.

### 17.5 `manifesto.config.ts`와 실제 코드 사이의 drift

**심각도:** 낮음 (§13에서 scope를 제한했으므로)

**완화책:** doctor는 "패키지 설치 상태"와 "bundler 설정 상태"만 검증한다. 런타임 코드에서 `withGovernance()`가 호출되는지 같은 의미론 검증은 하지 않는다.

### 17.6 AI 에이전트의 flag 조합 오류

**심각도:** 중간

**완화책:** invalid flag 조합 시 clear error message + valid 조합 예시 출력. `--help` 출력을 LLM-friendly하게 설계 (예시 포함, 약어 최소화).

---

## 18. 릴리스 계획

### Phase 1 — MVP

- `@manifesto-ai/cli` 패키지 생성
- `manifesto init` (interactive + `--preset`)
- `manifesto add` (lineage, governance, codegen, skills)
- `manifesto doctor` (기본 검사 + `--json`)
- Vite 우선 지원, Webpack 지원
- Capability Manifest 필드를 각 패키지에 추가 (additive change)

### Phase 2 — 안정화

- `manifesto doctor --strict` (CI 통합)
- 나머지 bundler 지원 확장 (rollup, esbuild, rspack)
- `manifesto info` (현재 설정 요약)
- `--dry-run` 전 명령에 추가
- config 스키마 안정화

### Phase 3 — 운영 도구

- `manifesto sync` (config 기반 상태 정렬)
- `manifesto migrate` (codemod 기반 버전 업그레이드)
- studio/lsp 통합 강화

---

## 19. 열린 질문

### Q1: Capability Manifest 스키마를 SPEC으로 정식화해야 하는가?

MVP에서는 `package.json`의 `manifesto` 필드로 시작하되, 안정화 후 별도 SPEC(`capability-manifest-SPEC.md`)으로 승격할지 결정한다.

### Q2: `manifesto doctor`를 `@manifesto-ai/skills`의 CLAUDE.md에서 권장해야 하는가?

skills의 LLM constitution에 "프로젝트 설정 후 `manifesto doctor`를 실행하라"를 추가하면, 에이전트가 자연스럽게 검증 루프에 진입한다. skills 팀과 협의 필요.

### Q3: `manifesto init`이 생성하는 샘플 MEL의 수준은?

Counter 수준의 최소 예시 vs. Coin Sapiens에서 추출한 실전 예시. MVP에서는 Counter 수준으로 시작하되, `--template` flag 예약.

---

## 20. 최종 요약

`@manifesto-ai/cli`는 새로운 런타임이 아니다. 새로운 메타 패키지도 아니다.

이 패키지는 현재 이미 잘 분리된 Manifesto 생태계 위에 올라가서:

- **시작을 빠르게 만들고** (`init`)
- **확장을 안전하게 만들고** (`add`)
- **상태를 검사 가능하게 만드는** (`doctor`)

공식 DX 계층이다.

인간과 AI 에이전트 모두를 1급 사용자로 다루며, 구조를 감추지 않고 조립을 대신한다.

> **`@manifesto-ai/cli`는 Manifesto 패키지들을 대체하지 않고, Manifesto 사용 흐름을 공식화한다.**
