import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import type { PolicyNodeData, NodeRow } from '../../domain/graph/buildGraph.ts';
import { uncomparedLabel, uncomparedPaths, type Expectation } from '../../domain/types.ts';
import { useRef } from 'react';
import { useFocusActions } from '../../state/focus.tsx';
import { useReportHeight } from '../../state/measure.tsx';

type PolicyFlowNode = Node<PolicyNodeData, 'policy'>;

const POLARITY_PREFIX: Record<string, string> = {
  exclude: 'except',
  require: 'requires',
};

/** Marker expectations get their own rendering. The string "true" must never appear. */
function Marker({ exp }: { exp: Expectation }) {
  if (exp.kind === 'wildcard') {
    return (
      <span
        className="marker"
        data-kind="wildcard"
        title="The baseline requires this dimension to be configured; the specific value is tenant-defined."
      >
        &#10216;any&#10217;
      </span>
    );
  }
  if (exp.kind === 'negated') {
    return (
      <span className="marker" data-kind="negated" title="Must be present and set to false.">
        not required
      </span>
    );
  }
  return (
    <span className="marker" data-kind="empty">
      declared, nothing specified
    </span>
  );
}

function ValueRow({ row }: { row: NodeRow }) {
  const shared = new Set((row.valueDiff?.shared ?? []).map((v) => v.toLowerCase()));
  const prefix = POLARITY_PREFIX[row.polarity];

  return (
    <div className="prow" data-status={row.status}>
      <div className="prow-label">
        <span>{row.label}</span>
        {prefix ? <span className="visually-hidden">{prefix}</span> : null}
        {row.status === 'only' ? <span className="prow-flag">only here</span> : null}
        {row.status === 'conflict' ? (
          <span className="prow-flag" title="Opposite polarity to another column">
            &#8869; conflict
          </span>
        ) : null}
      </div>

      <div className="prow-values">
        {row.display.length === 0 ? (
          <Marker exp={row.exp} />
        ) : (
          row.display.map((token, i) => (
            <span
              key={`${token.raw}-${i}`}
              className="token"
              data-resolved={token.resolved}
              data-shared={row.valueDiff ? shared.has(token.raw.toLowerCase()) : undefined}
              title={token.resolved ? token.raw : `Unresolved identifier: ${token.raw}`}
            >
              {token.label}
            </span>
          ))
        )}
      </div>
    </div>
  );
}

/** Screen-reader summary. The visual encoding is non-hue; this is its text equivalent. */
function describe(data: PolicyNodeData): string {
  const { title, kind, status, rows, terminal } = data;
  if (kind === 'ghost') return `${title}: not specified by this policy.`;
  if (kind === 'terminal') return `Outcome: ${terminal?.title ?? ''}. ${terminal?.sub ?? ''}`.trim();
  if (kind === 'head') {
    const n = uncomparedPaths(data.policy).length;
    return `Policy ${data.policy.id}, ${data.policy.name}.${n ? ` ${uncomparedLabel(n)}.` : ''}`;
  }

  const parts = rows.map((r) => {
    const values =
      r.display.length === 0
        ? r.exp.kind === 'wildcard'
          ? 'configured, value tenant-defined'
          : r.exp.kind === 'negated'
            ? 'not required'
            : 'declared but unspecified'
        : r.display.map((d) => d.label).join(', ');
    return `${r.label}: ${values}`;
  });

  const statusWord =
    status === 'same'
      ? 'matches every selected policy'
      : status === 'differs' || status === 'differs/coverage'
        ? 'differs from other selected policies'
        : status === 'conflict'
          ? 'conflicts with another selected policy'
          : status === 'only'
            ? 'unique to this policy'
            : '';

  return `${title}. ${parts.join('. ')}. ${statusWord}`.trim();
}

export function PolicyNode({ id, data }: NodeProps<PolicyFlowNode>) {
  const { kind, status, rows, policy, terminal, title, columnIndex, rankIndex, nodeKey } = data;
  const uncompared = kind === 'head' ? uncomparedPaths(policy) : [];
  const { setRank } = useFocusActions();
  const ref = useRef<HTMLDivElement>(null);
  useReportHeight(id, ref);

  // Keyboard only. The POINTER half of the cross-column highlight is wired on the
  // <ReactFlow> element via onNodeMouseEnter, not here: React Flow sets
  // `pointer-events: none` on a node wrapper unless the node is selectable, draggable,
  // or the flow itself carries node mouse handlers - and this board is none of the
  // first two. A pointer handler on this div is therefore never called.
  const enter = () => setRank(nodeKey);
  const leave = () => setRank(null);

  return (
    <div
      ref={ref}
      className="pnode"
      data-kind={kind}
      data-status={status}
      data-tone={terminal?.tone}
      data-col={columnIndex}
      data-rank={rankIndex}
      data-rank-key={nodeKey}
      tabIndex={kind === 'ghost' ? -1 : 0}
      role="group"
      aria-label={describe(data)}
      aria-disabled={kind === 'ghost' || undefined}
      onFocus={enter}
      onBlur={leave}
    >
      <Handle type="target" position={Position.Top} isConnectable={false} />

      {kind === 'head' ? (
        <>
          <div className="pnode-eyebrow">
            <span className="pnode-tick" aria-hidden="true" />
            <span>{policy.source === 'tenant' ? 'loaded' : policy.baselineKey}</span>
            <span>{policy.id}</span>
          </div>
          <div className="pnode-title">{policy.name}</div>
          <div className="pnode-meta">
            {policy.category ? <span>{policy.category}</span> : null}
            {policy.priority ? <span>{policy.priority}</span> : null}
            {policy.profileLevel ? <span>{policy.profileLevel}</span> : null}
            {policy.state ? <span>{policy.state}</span> : null}
            <span>{policy.policyIntent ?? 'Unclassified'}</span>
            {uncompared.length > 0 ? (
              <span
                className="pnode-uncompared"
                title={`Present in the source, not modelled, so not compared:\n${uncompared.join('\n')}`}
              >
                {uncomparedLabel(uncompared.length)}
              </span>
            ) : null}
          </div>
        </>
      ) : null}

      {kind === 'ghost' ? <span className="pnode-ghost-text">not specified</span> : null}

      {kind === 'facets' ? (
        <>
          <span className="visually-hidden">{title}</span>
          {rows.map((row) => (
            <ValueRow key={row.path} row={row} />
          ))}
        </>
      ) : null}

      {kind === 'terminal' && terminal ? (
        <>
          <div className="pnode-terminal">{terminal.title}</div>
          {terminal.sub ? <div className="pnode-terminal-sub">{terminal.sub}</div> : null}
        </>
      ) : null}

      <Handle type="source" position={Position.Bottom} isConnectable={false} />
    </div>
  );
}
