// Lock-screen and Dynamic Island layout for a running record, built from the props that
// `payload.ts` prepares.
//
// `babel-preset-expo` compiles a `'widget'` function into a string that the widget runtime
// evaluates, where the only things in scope are the function's own props and the SwiftUI
// components/modifiers exported by `@expo/ui/swift-ui`. So: no helper functions, no constants
// from other modules, and no imports used as values inside the component below.

import { HStack, Image, ProgressView, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  activityBackgroundTint, font, foregroundStyle, lineLimit, monospacedDigit, opacity, padding,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity, type LiveActivityEnvironment } from 'expo-widgets';

import type { SessionActivityProps } from './payload';

const SessionActivityLayout = (
  props: SessionActivityProps,
  environment: LiveActivityEnvironment
) => {
  'widget';

  const isSleep = props.kind === 'sleep';
  const isSettled = props.phase === 'settled';
  const dimmed = environment.isLuminanceReduced;
  // Always-On display renders a dimmed variant; keep the ink readable in both.
  const ink = isSleep ? '#F8FAFC' : '#101828';
  const mutedInk = dimmed ? (isSleep ? '#CBD5E1' : '#475467') : isSleep ? '#94A3B8' : '#667085';
  const accent = dimmed ? '#FFFFFF' : props.accent;
  const surface = props.surface;

  const started = new Date(props.startedAtMs);
  // A record without a target still needs an upper bound; the server caps records at 12 hours.
  // Counting up always runs to that cap, so a night that outlives its wake goal keeps counting
  // instead of freezing at the goal.
  const countingUpper = new Date(props.startedAtMs + 12 * 60 * 60 * 1000);
  const target = props.endsAtMs > 0 ? new Date(props.endsAtMs) : countingUpper;
  const countsDown = props.kind === 'focus' && props.endsAtMs > 0 && !isSettled;
  const mainUpper = countsDown ? target : countingUpper;
  const icon = isSleep ? 'moon.zzz.fill' : 'bolt.fill';

  return {
    banner: (
      <VStack alignment="leading" spacing={8}
        modifiers={[padding({ all: 16 }), activityBackgroundTint(surface)]}>
        <HStack spacing={6}>
          <Image systemName={icon} color={accent} size={13} />
          <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(accent)]}>
            {props.title}
          </Text>
          <Spacer />
          <Text modifiers={[font({ size: 12 }), foregroundStyle(mutedInk), lineLimit(1)]}>
            {props.goalLabel}
          </Text>
        </HStack>

        {isSettled ? (
          <Text modifiers={[font({ size: 28, weight: 'bold', design: 'rounded' }), monospacedDigit(),
            foregroundStyle(ink)]}>
            {props.summaryLabel}
          </Text>
        ) : (
          <Text timerInterval={{ lower: started, upper: mainUpper }} countsDown={countsDown}
            modifiers={[font({ size: 34, weight: 'bold', design: 'rounded' }), monospacedDigit(),
              foregroundStyle(ink)]} />
        )}

        {!isSettled && props.kind === 'focus' && props.endsAtMs > 0 ? (
          <ProgressView timerInterval={{ lower: started, upper: target }} countsDown={true}
            modifiers={[tint(accent), opacity(0.9)]} />
        ) : null}

        {!isSettled && isSleep && props.endsAtMs > 0 ? (
          <HStack spacing={4}>
            <Text modifiers={[font({ size: 12 }), foregroundStyle(mutedInk)]}>기상 목표까지</Text>
            <Text timerInterval={{ lower: started, upper: target }} countsDown={true}
              modifiers={[font({ size: 12, weight: 'semibold' }), monospacedDigit(),
                foregroundStyle(mutedInk)]} />
          </HStack>
        ) : null}

        <Text modifiers={[font({ size: 12 }), foregroundStyle(mutedInk), lineLimit(2)]}>
          {props.noteLabel}
        </Text>
      </VStack>
    ),

    compactLeading: <Image systemName={icon} color={accent} size={14} />,
    compactTrailing: isSettled ? (
      <Image systemName="checkmark.circle.fill" color={accent} size={14} />
    ) : (
      <Text timerInterval={{ lower: started, upper: mainUpper }} countsDown={countsDown}
        modifiers={[font({ size: 13, weight: 'semibold' }), monospacedDigit(),
          foregroundStyle(accent)]} />
    ),
    minimal: <Image systemName={icon} color={accent} size={14} />,

    expandedLeading: (
      <VStack alignment="leading" spacing={2}>
        <Image systemName={icon} color={accent} size={15} />
        <Text modifiers={[font({ size: 11, weight: 'semibold' }), foregroundStyle(accent)]}>
          {isSleep ? '수면' : '집중'}
        </Text>
      </VStack>
    ),
    expandedTrailing: (
      <VStack alignment="trailing" spacing={0}>
        {isSettled ? (
          <Text modifiers={[font({ size: 20, weight: 'bold', design: 'rounded' }), monospacedDigit(),
            foregroundStyle(ink)]}>
            {props.summaryLabel}
          </Text>
        ) : (
          <Text timerInterval={{ lower: started, upper: mainUpper }} countsDown={countsDown}
            modifiers={[font({ size: 22, weight: 'bold', design: 'rounded' }), monospacedDigit(),
              foregroundStyle(ink)]} />
        )}
        <Text modifiers={[font({ size: 11 }), foregroundStyle(mutedInk)]}>{props.goalLabel}</Text>
      </VStack>
    ),
    expandedBottom: (
      <HStack spacing={6}>
        <Text modifiers={[font({ size: 12 }), foregroundStyle(mutedInk), lineLimit(1)]}>
          {props.noteLabel}
        </Text>
        <Spacer />
        <Text modifiers={[font({ size: 11 }), foregroundStyle(mutedInk)]}>
          {props.kind === 'sleep' ? '아침에 한 번만 눌러 정산' : '20분부터 유효한 기록'}
        </Text>
      </HStack>
    ),
  };
};

export default createLiveActivity<SessionActivityProps>('OfflineTimeSession', SessionActivityLayout);
