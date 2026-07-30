import type React from 'react';
import { OptionButton } from '../../ui';
import { cn } from '../../../lib/utils/cn';
import { HeadingMatchOptions } from './HeadingMatchOptions';
import { McqQuestionOptions } from './McqQuestionOptions';
import { TrueFalseNotGivenOptions } from './TrueFalseNotGivenOptions';
import { TrueFalseOptions } from './TrueFalseOptions';

export type QuestionRendererMode = 'answer' | 'reveal';
export type RevealPhase = 'suspense' | 'reveal' | 'effects' | 'scores';

type QuestionType = 'mcq' | 'true_false' | 'true_false_not_given' | 'yes_no_not_given' | 'heading_match';
type OptionButtonState = React.ComponentProps<typeof OptionButton>['state'];
type OptionDensity = 'regular' | 'compact' | 'veryCompact';
type QuestionVisualStyle = 'premium' | 'modernClassic';

type BaseQuestion = {
  text: string;
  options: string[];
  type?: QuestionType | string;
};

type AnswerModeProps = {
  mode: 'answer';
  question: BaseQuestion;
  isLocked: boolean;
  selectedAnswerIndex: number | null;
  answerSubmitted: boolean;
  onSelectAnswer: (answerIndex: number) => void;
  animationDelayBase?: number;
  animationDelayStep?: number;
  compact?: boolean;
  veryCompact?: boolean;
  visualStyle?: QuestionVisualStyle;
  showLetterBadge?: boolean;
};

type RevealModeProps = {
  mode: 'reveal';
  question: BaseQuestion;
  revealPhase: RevealPhase;
  correctIndex: number;
  myAnswerIndex: number | null;
  myAnswerTimeSeconds?: number | null;
  registerOptionRef?: (index: number, node: HTMLButtonElement | null) => void;
  animationDelayBase?: number;
  animationDelayStep?: number;
  compact?: boolean;
  veryCompact?: boolean;
  visualStyle?: QuestionVisualStyle;
  showLetterBadge?: boolean;
};

export type QuestionRendererProps = AnswerModeProps | RevealModeProps;

const DEFAULT_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;

function normalizeQuestionType(raw: string | undefined): QuestionType {
  const lowered = (raw || 'mcq').toLowerCase();
  if (lowered === 'true_false') return 'true_false';
  if (lowered === 'true_false_not_given') return 'true_false_not_given';
  if (lowered === 'yes_no_not_given') return 'true_false_not_given'; // same UI, different labels
  if (lowered === 'heading_match') return 'heading_match';
  return 'mcq';
}

function getLettersForType(type: QuestionType, question?: BaseQuestion): string[] {
  if (type === 'true_false') return ['T', 'F'];
  if (type === 'true_false_not_given') {
    // Detect YNNG variant from option text
    const firstOpt = (question?.options?.[0] || '').trim().toLowerCase();
    if (firstOpt === 'yes') return ['Y', 'N', 'NG'];
    return ['T', 'F', 'NG'];
  }
  return [...DEFAULT_LETTERS];
}

function getAnswerOptionState(
  index: number,
  selectedAnswerIndex: number | null,
  isLocked: boolean
): OptionButtonState {
  if (selectedAnswerIndex === index) return 'selectedYou';
  if (isLocked) return 'disabled';
  return 'default';
}

function getRevealOptionState(
  index: number,
  revealPhase: RevealPhase,
  correctIndex: number,
  myAnswerIndex: number | null
): OptionButtonState {
  const isCorrect = index === correctIndex;
  const isWrongUserAnswer = myAnswerIndex === index && !isCorrect;

  if (revealPhase === 'suspense') return 'default';
  if (isCorrect) return 'spotlightCorrect';
  if (isWrongUserAnswer && revealPhase === 'reveal') return 'userWrongFlash';
  return 'spotlightDimmed';
}

function getOptionMinHeightClass(type: QuestionType, density: OptionDensity): string {
  if (density === 'veryCompact') {
    if (type === 'heading_match') return 'min-h-[58px]';
    if (type === 'true_false' || type === 'true_false_not_given') return 'min-h-[62px]';
    return 'min-h-[64px]';
  }

  if (density === 'compact') {
    if (type === 'heading_match') return 'min-h-[68px] sm:min-h-[74px]';
    if (type === 'true_false' || type === 'true_false_not_given') return 'min-h-[72px] sm:min-h-[78px]';
    return 'min-h-[74px] sm:min-h-[80px]';
  }

  if (type === 'heading_match') return 'min-h-[84px] sm:min-h-[92px]';
  return 'min-h-[92px] sm:min-h-[104px]';
}

function getAnswerButtonClassName(
  type: QuestionType,
  option: string,
  state: OptionButtonState,
  density: OptionDensity,
  visualStyle: QuestionVisualStyle
): string {
  const sizeClass = getOptionMinHeightClass(type, density);
  if (visualStyle === 'modernClassic') {
    return sizeClass;
  }
  if (state !== 'default') {
    return sizeClass;
  }

  const normalized = option.trim().toLowerCase();
  if (type === 'heading_match') {
    return sizeClass;
  }

  if (type === 'true_false' || type === 'true_false_not_given') {
    if (normalized === 'true' || normalized === 'yes') {
      return cn(
        sizeClass,
        'bg-[#052E1B] hover:bg-[#064E2B]',
        'border border-[#166534] hover:border-[#16A34A]'
      );
    }
    if (normalized === 'false' || normalized === 'no') {
      return cn(
        sizeClass,
        'bg-[#3F1010] hover:bg-[#5D1818]',
        'border border-[#7F1D1D] hover:border-[#B91C1C]'
      );
    }
    if (normalized === 'not given') {
      return cn(
        sizeClass,
        'bg-[#111827] hover:bg-[#1F2937]',
        'border border-[#334155] hover:border-[#475569]'
      );
    }
    return sizeClass;
  }

  return sizeClass;
}

function getRevealButtonClassName(type: QuestionType, density: OptionDensity): string {
  return getOptionMinHeightClass(type, density);
}

export function QuestionRenderer(props: QuestionRendererProps) {
  const type = normalizeQuestionType(props.question.type);
  const letters = getLettersForType(type, props.question);
  const delayBase = props.animationDelayBase ?? (props.mode === 'answer' ? 0.35 : 0);
  const delayStep = props.animationDelayStep ?? 0.08;
  const visualStyle = props.visualStyle ?? 'premium';
  const showLetterBadge = props.showLetterBadge ?? true;
  const optionDensity: OptionDensity = props.veryCompact ? 'veryCompact' : props.compact ? 'compact' : 'regular';
  const hasLongOptionText = props.question.options.some((option) => option.trim().length > 42);
  const useTwoColumnsOnMobileForMcq =
    visualStyle !== 'modernClassic' &&
    (props.compact || props.veryCompact) &&
    props.question.options.length >= 4 &&
    (!hasLongOptionText || props.veryCompact);

  const renderOption = (option: string, index: number) => {
    if (props.mode === 'answer') {
      const state = getAnswerOptionState(index, props.selectedAnswerIndex, props.isLocked);
      const isMyAnswer = props.selectedAnswerIndex === index;
      return (
        <OptionButton
          key={index}
          letter={letters[index] || String(index + 1)}
          label={option}
          variant={visualStyle === 'modernClassic' ? 'modernClassic' : 'premium'}
          state={state}
          density={optionDensity}
          className={getAnswerButtonClassName(type, option, state, optionDensity, visualStyle)}
          showLetterBadge={showLetterBadge}
          showUserMarker={isMyAnswer && props.answerSubmitted}
          showOpponentMarker={false}
          onClick={() => !props.isLocked && props.onSelectAnswer(index)}
          disabled={props.isLocked}
          animationDelay={delayBase + index * delayStep}
        />
      );
    }

    const state = getRevealOptionState(index, props.revealPhase, props.correctIndex, props.myAnswerIndex);
    const isCorrect = index === props.correctIndex;
    const responseTime = props.myAnswerIndex === index && props.myAnswerTimeSeconds ? props.myAnswerTimeSeconds : undefined;
    return (
      <OptionButton
        key={index}
        letter={letters[index] || String(index + 1)}
        label={option}
        variant={visualStyle === 'modernClassic' ? 'modernClassic' : 'reveal'}
        state={state}
        density={optionDensity}
        className={getRevealButtonClassName(type, optionDensity)}
        showLetterBadge={showLetterBadge}
        showUserMarker={false}
        showOpponentMarker={false}
        showSpotlight={isCorrect && props.revealPhase !== 'suspense'}
        responseTime={responseTime}
        disabled
        animationDelay={delayBase + index * delayStep}
        ref={(node) => props.registerOptionRef?.(index, node)}
      />
    );
  };

  const children = props.question.options.map((option, index) => renderOption(option, index));

  if (type === 'true_false') {
    return (
      <TrueFalseOptions compact={props.compact} veryCompact={props.veryCompact}>
        {children}
      </TrueFalseOptions>
    );
  }

  if (type === 'true_false_not_given') {
    return (
      <TrueFalseNotGivenOptions compact={props.compact} veryCompact={props.veryCompact}>
        {children}
      </TrueFalseNotGivenOptions>
    );
  }

  if (type === 'heading_match') {
    return (
      <HeadingMatchOptions compact={props.compact} veryCompact={props.veryCompact}>
        {children}
      </HeadingMatchOptions>
    );
  }

  return (
    <McqQuestionOptions
      compact={props.compact}
      veryCompact={props.veryCompact}
      twoColumnsOnMobile={useTwoColumnsOnMobileForMcq}
    >
      {children}
    </McqQuestionOptions>
  );
}
