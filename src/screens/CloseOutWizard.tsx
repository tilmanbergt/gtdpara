/**
 * The project close-out wizard (docs/dev/technical-design-project-close-out.md
 * §8; mockups: Claude Design canvas "gtdpara Project Close-out Wizard").
 * Full close-out: Checklist → Contents → Outcomes → PDF → Archive. Quick
 * archive: Checklist → Archive (no PDF, no outcome moves).
 *
 * This container owns only flow state: which step is showing, the loaded
 * CloseOutContext (storage/closeOut/context.ts), and the two long-running
 * jobs (PDF creation, archive run). Each step is its own component under
 * ui/closeOut/; every decision is written to the project's `## Close-out`
 * plan immediately, so leaving and coming back continues where it stopped.
 * After every action the context is re-derived from the cache (no rescan -
 * the folder scan only runs on open and on 🔄).
 *
 * Shown by App.tsx in place of the Review tab's content while a close-out
 * is open (§8.3).
 */
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {ActivityIndicator, StyleSheet, Text, View} from 'react-native';
import {ArchiveOp} from '../domain/closeOut/archiveOps';
import {ContentEntry} from '../domain/closeOut/inventory';
import {
  archiveStarted,
  CLOSE_OUT_STEPS,
  CloseOutMode,
  CloseOutPlan,
  CloseOutStep,
  OutcomeDest,
  withInclusion,
  withMove,
  withMovedItem,
  withPdf,
  withStep,
} from '../domain/closeOut/plan';
import {blockers} from '../domain/closeOut/readiness';
import {GtdParaSettings} from '../domain/settings';
import {assignProjectToArea, unassignProject} from '../storage/areaAssignment';
import {CloseOutContext, loadCloseOutContext, refreshCloseOutContext} from '../storage/closeOut/context';
import {archiveOpsFor, runCloseOutArchive} from '../storage/closeOut/execute';
import {CloseOutPdfJob, startCloseOutPdf} from '../storage/closeOut/pdf';
import {loadPlan, savePlan} from '../storage/closeOut/planStore';
import {findCachedItem} from '../storage/dataCache';
import {cancelMeeting, closeTask, moveMeetingTo, moveTaskTo, MoveTarget} from '../storage/itemMove';
import {PdfExportCancelled} from '../storage/pdfExport';
import {loadSettings} from '../storage/settingsStorage';
import {setDoneDate} from '../storage/statusControl';
import {fileExists, openPath} from '../supernote/fileSystem';
import {replacePdfConfirmText} from '../domain/fileChangeText';
import ArchiveStep, {ArchiveRunState} from '../ui/closeOut/ArchiveStep';
import ChecklistStep, {ChecklistActions} from '../ui/closeOut/ChecklistStep';
import ContentsStep from '../ui/closeOut/ContentsStep';
import OutcomesStep from '../ui/closeOut/OutcomesStep';
import PdfStep, {PdfRunState} from '../ui/closeOut/PdfStep';
import PillButton from '../ui/PillButton';
import {FONT, SPACING, useThemeColors} from '../ui/theme';
import StepIndicator, {StepDef} from '../ui/wizard/StepIndicator';
import WizardFrame from '../ui/wizard/WizardFrame';
import {logError} from '../utils/log';
import {requestEinkRefresh} from '../utils/screenRefresh';
import {useErrorStatus, useStatus} from '../ui/status/StatusProvider';

interface Props {
  projectPath: string;
  mode: CloseOutMode;
  /** `archived` true once the project folder has moved into the archive. */
  onExit: (archived: boolean) => void;
}

const STEP_LABELS: Record<CloseOutStep, string> = {
  checklist: 'Checklist',
  contents: 'Contents',
  outcomes: 'Outcomes',
  pdf: 'PDF',
  archive: 'Archive',
};

function stepsFor(mode: CloseOutMode): CloseOutStep[] {
  return mode === 'quick' ? ['checklist', 'archive'] : CLOSE_OUT_STEPS;
}

const IDLE_PDF: PdfRunState = {running: false, progress: null, failedPages: [], lastRunMs: null, error: null};
const IDLE_ARCHIVE: ArchiveRunState = {running: false, steps: null, ok: null, error: null};
/** Progress repaints at most this often - every e-ink repaint flashes. */
const PROGRESS_PAINT_MS = 1000;

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export default function CloseOutWizard({projectPath, mode: requestedMode, onExit}: Props): React.JSX.Element {
  const {textColor, borderColor, placeholderColor} = useThemeColors();
  const [ctx, setCtx] = useState<CloseOutContext | null>(null);
  const [loadLabel, setLoadLabel] = useState('Loading…');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState<CloseOutStep>('checklist');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  useErrorStatus('CloseOutWizard.actionError', actionError, () => setActionError(null));
  const [pdfRun, setPdfRun] = useState<PdfRunState>(IDLE_PDF);
  const [archiveRun, setArchiveRun] = useState<ArchiveRunState>(IDLE_ARCHIVE);
  // Run errors -> central status slot (docs/dev/technical-design-status-slot.md §7.4).
  useErrorStatus('closeOut.pdf', pdfRun.error, () => setPdfRun(prev => ({...prev, error: null})));
  useErrorStatus('closeOut.archive', archiveRun.error, () => setArchiveRun(prev => ({...prev, error: null})));
  const settingsRef = useRef<GtdParaSettings | null>(null);
  const pdfJobRef = useRef<CloseOutPdfJob | null>(null);
  const lastPaint = useRef(0);

  const mode: CloseOutMode = ctx?.mode ?? requestedMode;
  const steps = stepsFor(mode);

  const refresh = useCallback(
    async (base?: CloseOutContext): Promise<CloseOutContext | null> => {
      const settings = settingsRef.current;
      const scan = (base ?? ctx)?.scan;
      if (!settings || !scan) return null;
      const next = await refreshCloseOutContext({scan, settings, mode: requestedMode, projectPath});
      setCtx(next);
      return next;
    },
    [ctx, projectPath, requestedMode],
  );

  const load = useCallback(async () => {
    setLoadError(null);
    setCtx(null);
    setLoadLabel('Loading…');
    try {
      const settings = await loadSettings();
      settingsRef.current = settings;
      let loaded = await loadCloseOutContext(projectPath, settings, requestedMode, setLoadLabel);
      // Start (or switch) the plan: a quick archive requested on a project with an
      // unfinished full plan switches it to quick, unless an archive run already started.
      if (!loaded.planFound || (loaded.plan.mode !== requestedMode && !archiveStarted(loaded.plan))) {
        await savePlan(projectPath, {...loaded.plan, mode: requestedMode, step: loaded.planFound ? loaded.plan.step : 'checklist'});
        loaded = await refreshCloseOutContext({scan: loaded.scan, settings, mode: requestedMode, projectPath});
      }
      const planStep = loaded.plan.step;
      setStep(stepsFor(loaded.mode).includes(planStep) ? planStep : 'checklist');
      setCtx(loaded);
    } catch (e) {
      logError('CloseOutWizard: load failed', message(e));
      setLoadError(message(e));
    } finally {
      requestEinkRefresh();
    }
  }, [projectPath, requestedMode]);

  useEffect(() => {
    load();
    // Load once per project/mode; 🔄 reloads explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectPath, requestedMode]);


  /** Runs an action, then re-derives the context. Errors show under the step. */
  const run = useCallback(
    async (fn: () => Promise<void>) => {
      setBusy(true);
      setActionError(null);
      try {
        await fn();
        await refresh();
      } catch (e) {
        logError('CloseOutWizard: action failed', message(e));
        setActionError(message(e));
      } finally {
        setBusy(false);
        requestEinkRefresh();
      }
    },
    [refresh],
  );

  /** Read-modify-write of the plan, always from the freshest cached copy. */
  const updatePlan = useCallback(
    async (fn: (plan: CloseOutPlan) => CloseOutPlan) => {
      await savePlan(projectPath, fn(loadPlan(projectPath).plan));
    },
    [projectPath],
  );

  const goTo = useCallback(
    (next: CloseOutStep) => {
      if (busy || pdfRun.running || archiveRun.running) return;
      setStep(next);
      run(() => updatePlan(p => withStep(p, next)));
    },
    [busy, pdfRun.running, archiveRun.running, run, updatePlan],
  );

  // ---- step 1: checklist actions ----
  const moveTarget = useCallback(
    (to: 'area' | 'inbox'): MoveTarget => {
      if (to === 'inbox' || !ctx?.item.area) return {type: 'inbox'};
      return {type: 'item', kind: 'area', name: ctx.item.area, path: `${ctx.paths.areas}/${ctx.item.area}`};
    },
    [ctx],
  );

  const checklistActions: ChecklistActions = useMemo(
    () => ({
      closeTodo: (index, how) => run(() => closeTask(projectPath, index, how)),
      moveTodo: (index, to) =>
        run(async () => {
          if (!ctx) return;
          const task = await moveTaskTo(projectPath, index, moveTarget(to), ctx.paths);
          await updatePlan(p => withMovedItem(p, {kind: 'todo', label: task.text, to: to === 'area' && ctx.item.area ? `area:${ctx.item.area}` : 'inbox'}));
        }),
      cancelMeeting: index => run(() => cancelMeeting(projectPath, index)),
      moveMeeting: (index, to) =>
        run(async () => {
          if (!ctx) return;
          const meeting = await moveMeetingTo(projectPath, index, moveTarget(to), ctx.paths);
          await updatePlan(p => withMovedItem(p, {kind: 'meeting', label: `${meeting.date} ${meeting.title}`, to: to === 'area' && ctx.item.area ? `area:${ctx.item.area}` : 'inbox'}));
        }),
      setArea: areaName =>
        run(async () => {
          const item = findCachedItem(projectPath);
          if (!item) throw new Error('This project changed on disk - Settings → Advanced → Reload all files.');
          if (areaName) await assignProjectToArea(item, areaName);
          else await unassignProject(item);
        }),
      setDoneAt: date => run(() => setDoneDate(projectPath, date)),
    }),
    [ctx, moveTarget, projectPath, run, updatePlan],
  );

  // ---- steps 2-3 ----
  const toggleEntry = (entry: ContentEntry) => run(() => updatePlan(p => withInclusion(p, entry.key, !entry.included, entry.includedByDefault)));
  const setMove = (entry: ContentEntry, dest: OutcomeDest | null) => {
    if (!entry.filePath) return;
    const path = entry.filePath;
    run(() => updatePlan(p => withMove(p, path, dest)));
  };

  // ---- step 4: PDF ----
  // Replacing an existing PDF is announced and confirmed first
  // (docs/dev/technical-design-inkhub-submission.md §3.4/§3.8).
  const [replaceConfirm, setReplaceConfirm] = useState<string | null>(null);
  useStatus(
    'CloseOutWizard.replacePdf',
    replaceConfirm
      ? {
          kind: 'confirm',
          text: replacePdfConfirmText(replaceConfirm),
          actions: [
            {
              label: 'Replace',
              primary: true,
              onPress: () => {
                setReplaceConfirm(null);
                startPdf(true);
              },
            },
          ],
          onCancel: () => setReplaceConfirm(null),
        }
      : null,
  );
  const createPdf = () => {
    if (!ctx || pdfRun.running) return;
    setActionError(null);
    fileExists(ctx.workingPdfPath)
      .then(exists => {
        if (exists) setReplaceConfirm(ctx.display(ctx.workingPdfPath));
        else startPdf(false);
      })
      .catch(e => {
        logError('CloseOutWizard: checking for an existing PDF failed', message(e));
        setActionError(message(e));
      });
  };
  const startPdf = (replaceExisting: boolean) => {
    if (!ctx || pdfRun.running) return;
    setActionError(null);
    setPdfRun({...IDLE_PDF, running: true});
    lastPaint.current = 0;
    requestEinkRefresh();
    const job = startCloseOutPdf(ctx, p => {
      const now = Date.now();
      if (now - lastPaint.current < PROGRESS_PAINT_MS) return;
      lastPaint.current = now;
      setPdfRun(prev => ({...prev, progress: p}));
      requestEinkRefresh();
    }, replaceExisting);
    pdfJobRef.current = job;
    job.done
      .then(async result => {
        setPdfRun({running: false, progress: null, failedPages: result.failedPages, lastRunMs: result.totalMs, error: null});
        await refresh();
      })
      .catch(e => {
        const cancelled = e instanceof PdfExportCancelled;
        if (!cancelled) logError('CloseOutWizard: PDF failed', message(e));
        setPdfRun({...IDLE_PDF, error: cancelled ? 'PDF creation was cancelled - nothing was written.' : message(e)});
      })
      .finally(() => {
        pdfJobRef.current = null;
        requestEinkRefresh();
      });
  };

  // ---- step 5: archive ----
  const ops: ArchiveOp[] = useMemo(() => {
    if (!ctx || !settingsRef.current || archiveRun.ok) return archiveRun.steps?.map(s => s.op) ?? [];
    try {
      return archiveOpsFor(projectPath, settingsRef.current);
    } catch {
      return [];
    }
  }, [ctx, projectPath, archiveRun.ok, archiveRun.steps]);

  const archive = async () => {
    const settings = settingsRef.current;
    if (!ctx || !settings || archiveRun.running) return;
    setArchiveRun({...IDLE_ARCHIVE, running: true});
    requestEinkRefresh();
    try {
      // Blockers are re-checked against the cache as it is now.
      const fresh = await refresh();
      if (!fresh) throw new Error('Could not reload the project.');
      if (blockers(fresh.findings).length > 0) throw new Error('The checklist has blockers again - see step 1.');
      const result = await runCloseOutArchive(projectPath, settings, s => {
        setArchiveRun(prev => ({...prev, steps: s}));
        requestEinkRefresh();
      });
      setArchiveRun({running: false, steps: result.steps, ok: result.ok, error: null});
      if (!result.ok) await refresh();
    } catch (e) {
      logError('CloseOutWizard: archive failed', message(e));
      setArchiveRun({...IDLE_ARCHIVE, error: message(e)});
    } finally {
      requestEinkRefresh();
    }
  };

  // ---- rendering ----
  const stepDefs: StepDef<CloseOutStep>[] = steps.map(k => ({key: k, label: STEP_LABELS[k]}));
  const index = steps.indexOf(step);
  const title = `${mode === 'quick' ? 'Quick archive' : 'Close out'} · ${ctx?.item.name ?? projectPath.slice(projectPath.lastIndexOf('/') + 1)}`;
  const locked = busy || pdfRun.running || archiveRun.running;

  if (!ctx) {
    return (
      <View style={styles.center}>
        {loadError ? (
          <>
            <Text style={[styles.message, {color: textColor}]}>⚠ {loadError}</Text>
            <View style={styles.row}>
              <PillButton label="Try again" size="large" onPress={load} textColor={textColor} borderColor={borderColor} />
              <PillButton label="Back" size="large" onPress={() => onExit(false)} textColor={textColor} borderColor={borderColor} />
            </View>
          </>
        ) : (
          <>
            <ActivityIndicator />
            <Text style={[styles.message, {color: textColor}]}>{loadLabel}</Text>
          </>
        )}
      </View>
    );
  }

  const footer =
    step === 'archive' && archiveRun.ok ? (
      <View style={styles.flex} />
    ) : (
      <>
        <PillButton label="‹ Back" size="large" disabled={locked || index <= 0} onPress={() => goTo(steps[index - 1])} textColor={textColor} borderColor={borderColor} />
        <PillButton label="Save & leave" size="large" disabled={locked} onPress={() => onExit(false)} textColor={textColor} borderColor={borderColor} />
        <View style={styles.flex} />
        {index < steps.length - 1 && (
          <PillButton label={`Next: ${STEP_LABELS[steps[index + 1]]} ›`} size="large" primary disabled={locked} onPress={() => goTo(steps[index + 1])} textColor={textColor} borderColor={borderColor} />
        )}
      </>
    );

  return (
    <WizardFrame
      breadcrumb="Done awaiting review"
      onBreadcrumb={() => !locked && onExit(archiveRun.ok === true)}
      note="Saved in the project file · continue any time"
      title={title}
      stepKey={step}
      stepBar={<StepIndicator steps={stepDefs} current={step} done={steps.slice(0, index)} onPress={locked ? undefined : goTo} textColor={textColor} borderColor={borderColor} />}
      footer={footer}
      textColor={textColor}
      borderColor={borderColor}>
      {step === 'checklist' && <ChecklistStep ctx={ctx} busy={locked} actions={checklistActions} textColor={textColor} borderColor={borderColor} placeholderColor={placeholderColor} />}
      {step === 'contents' && <ContentsStep ctx={ctx} busy={locked} onToggle={toggleEntry} textColor={textColor} borderColor={borderColor} />}
      {step === 'outcomes' && <OutcomesStep ctx={ctx} busy={locked} onSetMove={setMove} textColor={textColor} borderColor={borderColor} />}
      {step === 'pdf' && (
        <PdfStep
          ctx={ctx}
          busy={locked}
          run={pdfRun}
          onCreate={createPdf}
          onCancel={() => pdfJobRef.current?.cancel()}
          onOpen={() => run(() => openPath(ctx.workingPdfPath))}
          onToggleChecked={() => run(() => updatePlan(p => (p.pdf ? withPdf(p, {...p.pdf, checked: !p.pdf.checked}) : p)))}
          onChangeContents={() => goTo('contents')}
          textColor={textColor}
          borderColor={borderColor}
        />
      )}
      {step === 'archive' && (
        <ArchiveStep ctx={ctx} ops={ops} run={archiveRun} onArchive={archive} onFinish={() => onExit(true)} onGoToStep={goTo} textColor={textColor} borderColor={borderColor} />
      )}
    </WizardFrame>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.xl,
  },
  message: {
    fontSize: FONT.medium,
    marginVertical: SPACING.md,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
  },
  flex: {
    flex: 1,
  },
  error: {
    fontSize: FONT.small,
    fontWeight: '700',
    marginBottom: SPACING.sm,
  },
});
