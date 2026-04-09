# Proposal: `@manifesto-ai/cli` Upstream Change Management

## 0. 문서 정보

| 항목 | 값 |
|------|-----|
| 문서명 | Proposal — `@manifesto-ai/cli` Upstream Change Management |
| 버전 | 0.1.0-draft |
| 작성일 | 2026-04-04 |
| 작성 목적 | 다른 Manifesto 패키지 변경 시 CLI 재배포 필요성을 어떻게 관리할지 제안 |
| 대상 | Manifesto Core 팀, DX/CLI 담당자, 패키지 오너 |

---

## 1. 한 줄 요약

`@manifesto-ai/cli`는 업스트림 패키지의 사실을 직접 소유하지 않고, **패키지가 선언한 메타데이터와 검증된 버전 세트(version set)를 해석하는 조합/운영 계층**으로 축소하는 것이 바람직하다.

---

## 2. 문제 정의

현재 CLI는 MVP 단계에서 빠르게 동작하도록 필요한 지식을 일부 직접 품고 있다.

대표적으로:

- capability 관계 (`lineage`, `governance`, `codegen`, `skills`)
- bundler subpath (`@manifesto-ai/compiler/vite` 등)
- `doctor`의 조합 검사 규칙
- skills 후속 안내 문구
- 샘플 코드와 scaffolding 기본값

이 방식은 초기 구현에는 빠르지만, 시간이 지나면 다음 문제가 생긴다.

### 2.1 업스트림 변경이 CLI 재배포 압력으로 바로 전이된다

예:

- `governance`의 선행 요구사항이 바뀜
- `compiler`의 bundler integration entry가 바뀜
- `skills`의 설치 후 안내가 바뀜
- `codegen` 연결 방식이 바뀜

이런 변경은 실제 소유 패키지 쪽의 사실인데, CLI가 하드코딩하고 있으면 CLI도 항상 함께 릴리스해야 한다.

### 2.2 CLI가 도메인 의미를 과도하게 소유하게 된다

PRD의 원칙은 명확하다.

> CLI는 도메인 의미를 소유하지 않고, 조합과 운영 흐름을 소유해야 한다.

하지만 규칙이 CLI 코드 안에 많아질수록, CLI는 점점 "해석기"가 아니라 "또 다른 스펙 구현체"가 된다.

### 2.3 독립 릴리스 생태계와 충돌한다

Manifesto 패키지들은 독립적으로 진화할 가능성이 높다.

- `sdk`
- `compiler`
- `lineage`
- `governance`
- `codegen`
- `skills`

이 구조에서 CLI가 모든 지식의 중앙 저장소가 되면, 릴리스 속도가 느려지고 drift가 생긴다.

---

## 3. 목표와 비목표

### 3.1 목표

1. 업스트림 패키지가 자기 사실을 직접 선언하게 만든다.
2. CLI는 그 선언을 읽는 해석기에 머문다.
3. 업스트림 변경이 있을 때 CLI 반영 과정을 자동화한다.
4. 자동화는 하되, 최종 npm 배포는 여전히 사람이 승인할 수 있게 유지한다.
5. "언제 CLI를 다시 배포해야 하는가"를 명확한 규칙으로 정의한다.

### 3.2 비목표

1. 모든 업스트림 변경마다 무조건 CLI를 자동 배포하지 않는다.
2. CLI가 정적 분석기처럼 런타임 코드를 깊게 해석하게 만들지 않는다.
3. 각 패키지의 문서/스펙을 CLI가 대체하지 않는다.

---

## 4. 제안 원칙

### 4.1 패키지가 사실을 소유한다

조합 규칙, 호환 범위, bundler integration 정보, 설치 후 안내는 각 패키지가 소유한다.

CLI는 다음만 담당한다:

- 현재 프로젝트 읽기
- 선언된 메타데이터 해석
- 설치/설정 orchestration
- drift 진단

### 4.2 CLI는 "해석기 + 운영면"에 집중한다

CLI가 직접 품어도 되는 것은 다음 정도로 제한한다.

- 사용자 UX
- interactive / non-interactive flow
- 출력 포맷
- 파일 수정 전략
- 자동화 workflow

### 4.3 자동화는 PR까지, 배포는 승인 후

업스트림 릴리스가 CLI에 영향을 줄 수 있더라도, 바로 npm publish까지 자동으로 가는 것은 위험하다.

권장 흐름:

1. 업스트림 변경 감지
2. CLI compatibility PR 자동 생성
3. smoke/integration 검증
4. 사람 리뷰
5. 수동 publish workflow 실행

---

## 5. 핵심 제안

## 5.1 Capability Manifest를 패키지 소유 정보로 사용한다

각 Manifesto 패키지는 `package.json`의 `manifesto` 필드에 machine-readable 메타데이터를 노출한다.

예시:

```jsonc
{
  "name": "@manifesto-ai/governance",
  "version": "3.3.0",
  "manifesto": {
    "capability": "governance",
    "requires": ["lineage"],
    "compatibleWith": {
      "sdk": ">=3.0.0",
      "lineage": ">=3.0.0"
    },
    "cli": {
      "installNotes": [
        "Governance composes on top of lineage.",
        "Install lineage before governance unless auto-deps is explicitly enabled."
      ]
    }
  }
}
```

```jsonc
{
  "name": "@manifesto-ai/compiler",
  "version": "3.3.0",
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

```jsonc
{
  "name": "@manifesto-ai/skills",
  "version": "1.0.0",
  "manifesto": {
    "capability": "skills",
    "cli": {
      "installNotes": [
        "Codex: pnpm exec manifesto-skills install-codex",
        "Claude Code: pnpm exec manifesto-skills install-claude",
        "Cursor: pnpm exec manifesto-skills install-cursor",
        "Copilot: pnpm exec manifesto-skills install-copilot",
        "Windsurf: pnpm exec manifesto-skills install-windsurf"
      ]
    }
  }
}
```

이 구조를 쓰면 CLI는 현재 하드코딩된 일부 지식을 제거할 수 있다.

현재 하드코딩 위치의 예:

- `src/lib/constants.js`
- `src/lib/plans.js`
- `src/lib/doctor.js`

방향은 간단하다.

- capability 정의를 패키지 manifest에서 읽는다
- `doctor` 규칙을 manifest에서 도출한다
- 설치 후 출력 문구도 manifest에서 읽는다

즉, 규칙의 소유권이 CLI가 아니라 패키지로 이동한다.

---

## 5.2 검증된 조합을 위한 Version Set을 도입한다

메타데이터만으로는 충분하지 않다.

왜냐하면 "무엇이 가능하다"와 "무엇이 함께 검증되었다"는 다른 문제이기 때문이다.

그래서 CLI는 별도의 version set을 가져야 한다.

예:

```json
{
  "channel": "stable",
  "updatedAt": "2026-04-04",
  "packages": {
    "@manifesto-ai/sdk": "^3.8.0",
    "@manifesto-ai/compiler": "^3.3.0",
    "@manifesto-ai/lineage": "^3.7.0",
    "@manifesto-ai/governance": "^3.7.0",
    "@manifesto-ai/codegen": "^0.2.5",
    "@manifesto-ai/skills": "^1.0.0"
  }
}
```

CLI 기본 동작:

- `manifesto init`는 기본적으로 `stable` 채널을 사용한다
- `manifesto add`도 기본적으로 `stable` 채널 버전을 사용한다
- 필요하면 `--channel next` 또는 `--latest` 같은 escape hatch를 둔다

이 방식의 장점:

- CLI가 설치할 버전을 예측 가능하게 만든다
- 독립 패키지 릴리스 속도와 사용자 안정성을 분리할 수 있다
- smoke test를 통과한 조합만 기본값으로 제공할 수 있다

---

## 5.3 업스트림 릴리스는 CLI 호환성 PR을 자동으로 연다

권장 자동화는 "업스트림 릴리스 -> CLI 자동 PR"이다.

### 흐름

1. `sdk` 또는 `compiler` 또는 `skills` 같은 패키지가 릴리스된다
2. 해당 패키지 repo가 `repository_dispatch` 또는 `workflow_call`로 CLI repo workflow를 트리거한다
3. CLI repo의 `ecosystem-sync` workflow가 동작한다
4. workflow는 다음을 수행한다

- 새 업스트림 버전 조회
- 관련 package manifest 스냅샷 갱신
- version set 갱신 후보 생성
- integration smoke test 실행
- 변경이 있으면 PR 생성

### PR이 포함해야 할 것

- 어떤 업스트림 패키지가 바뀌었는지
- version set diff
- smoke test 결과
- CLI 코드 변경 필요 여부
- human approval checklist

### 왜 PR인가

자동 배포는 너무 공격적이다.

특히 다음은 사람이 보고 판단해야 한다.

- 샘플 코드 문구 변화
- doctor 메시지 변화
- 호환성 규칙의 semantic change
- UX 변화

따라서 자동화는 "문제 발견 + 변경 초안 생성"까지만 담당하는 게 맞다.

---

## 5.4 CLI 배포 기준을 명확히 나눈다

CLI를 언제 다시 배포해야 하는지 규칙이 필요하다.

### 배포 불필요

다음은 일반적으로 CLI 재배포가 필요 없다.

- 업스트림 내부 구현 변경
- public manifest/compatibility/bundler 사실이 변하지 않는 변경
- CLI smoke test에 영향을 주지 않는 문서 변경

### Patch 배포

다음은 patch 배포 대상이다.

- version set 갱신
- install note 변경
- doctor 판정 메시지 조정
- 샘플 코드/스캐폴드 출력 변경
- publish/sync workflow 변경

### Minor 배포

다음은 minor 배포 대상이다.

- 새 capability 지원
- 새 bundler 지원
- 새 flag/command 추가
- 새 channel 도입

### Major 배포

다음은 major 배포 대상이다.

- `manifesto.config.ts` 계약 변경
- 기존 `init/add/doctor` 의미 변경
- 기존 non-interactive flag 조합 호환성 파괴

---

## 6. 권장 운영 구조

### 6.1 저장소 역할 분리

각 패키지 repo:

- 자기 `manifesto` 메타데이터 소유
- 릴리스 시 변경 사실 발행

CLI repo:

- version set 소유
- integration test 소유
- 조합 UX 소유
- npm publish 최종 게이트 소유

### 6.2 권장 workflow

#### A. `ecosystem-sync.yml`

트리거:

- `repository_dispatch`
- 수동 `workflow_dispatch`
- 주기적 `schedule`

역할:

- 업스트림 패키지 버전/manifest 수집
- version set 갱신 후보 생성
- smoke test 실행
- 변경 시 PR 생성

#### B. `integration-matrix.yml`

검증 조합 예시:

- preset: `base`, `lineage`, `gov`
- bundler: `vite`, `webpack`, `node-loader`
- tooling: `none`, `codegen`, `skills`

검사 내용:

- `manifesto init --dry-run`
- fixture 프로젝트에 실제 `init`
- `manifesto add governance`
- `manifesto doctor --json`

#### C. `publish-npm.yml`

역할:

- 최종 수동 배포
- `stable` version set과 테스트 통과 이후에만 실행

---

## 7. 구체적 도입 순서

### Phase 1 — Manifest 도입

1. `sdk`, `compiler`, `lineage`, `governance`, `codegen`, `skills`에 `manifesto` 필드 추가
2. CLI의 일부 하드코딩을 manifest 읽기로 대체
3. `doctor`에서 compatibility를 manifest 기반으로 우선 읽게 정리

### Phase 2 — Version Set 도입

1. `stable.json` 추가
2. `init/add`가 version set을 기본으로 사용하도록 변경
3. `--latest`, `--channel next` 전략 정의

### Phase 3 — Ecosystem Sync 자동화

1. `ecosystem-sync.yml` 추가
2. 업스트림 repo release event와 연동
3. smoke test 통과 시 자동 PR 생성

### Phase 4 — 운영 안정화

1. CLI 배포 기준을 문서화
2. release checklist 확정
3. 사람이 승인하는 publish 게이트 유지

---

## 8. 권장 smoke test 예시

최소한 다음은 항상 돌려야 한다.

1. 빈 fixture에 `manifesto init --preset base --bundler vite`
2. 빈 fixture에 `manifesto init --preset gov --bundler webpack --tooling codegen,skills`
3. `manifesto add lineage`
4. `manifesto add governance --auto-deps`
5. `manifesto doctor --json`
6. skills 설치 감지 시나리오
7. bundler plugin 감지/삽입 시나리오

이 테스트가 통과하면, 업스트림 버전이 바뀌어도 CLI 기본 사용 흐름은 유지된다고 볼 수 있다.

---

## 9. 열린 질문

### Q1. Version Set은 CLI repo에 둘 것인가, 별도 manifest repo에 둘 것인가?

초기에는 CLI repo에 두는 편이 단순하다.

이유:

- publish와 같은 승인 흐름에 붙이기 쉽다
- integration test와 같은 repo에서 관리할 수 있다
- 초기 복잡도를 낮춘다

### Q2. 업스트림 manifest를 언제 신뢰할 것인가?

이상적으로는 package publish artifact 기준으로 읽는 것이 맞다.

즉:

- source repo의 HEAD가 아니라
- 실제 npm에 publish된 `package.json` 기준

이렇게 해야 CLI가 현실의 설치 결과와 동일한 정보를 읽게 된다.

### Q3. skills처럼 "문서/설치 가이드" 성격이 큰 패키지는 언제 CLI patch 배포 대상이 되는가?

권장 기준:

- 사용자가 보는 CLI 출력이나 다음 단계가 바뀌면 patch 배포
- 내부 knowledge만 바뀌고 CLI 출력이 안 바뀌면 배포 불필요

---

## 10. 최종 제안

권장 운영 모델은 다음 한 문장으로 요약할 수 있다.

> **업스트림 패키지가 사실을 소유하고, CLI는 그 사실을 해석하는 운영 계층이 되며, 업스트림 변경은 자동 PR로 반영하고, 최종 배포는 사람이 승인한다.**

이 구조를 택하면 다음을 동시에 만족할 수 있다.

- CLI의 하드코딩 부담 감소
- 업스트림 독립 릴리스 유지
- 사용자에게는 안정적인 기본 조합 제공
- 변화는 빠르게 감지하되, 최종 배포는 통제 가능

즉, CLI는 "항상 같이 바뀌어야 하는 패키지"가 아니라, "생태계 상태를 읽고 공식 흐름으로 정렬하는 패키지"가 된다.
