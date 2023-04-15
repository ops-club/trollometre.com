import { writable, get, Writable } from 'svelte/store';
import autoBind from 'auto-bind';
import type { Config } from './config.js';

function isEqual(a1: Array<number>, a2: Array<number>): boolean {
    return JSON.stringify(a1) === JSON.stringify(a2);
}

function shuffle(array: Array<any>, n: number | undefined): Array<any> {
    // https://stackoverflow.com/questions/2450954/how-to-randomize-shuffle-a-javascript-array
    let currentIndex = array.length,
        temporaryValue,
        randomIndex;

    // While there remain elements to shuffle...
    while (0 !== currentIndex) {
        // Pick a remaining element...
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex -= 1;
        // And swap it with the current element.
        temporaryValue = array[currentIndex];
        array[currentIndex] = array[randomIndex];
        array[randomIndex] = temporaryValue;
    }
    return array.slice(0, n);
}

// we need to reference the classes in the svelte app despite minifaction of class names
export type QuestionType = 'MultipleChoice' | 'SingleChoice' | 'Sequence' | 'ScoreChoice';

export abstract class BaseQuestion {
    readonly text: string;
    answers: Array<Answer>;
    readonly explanation: string;
    selected: Array<number>;
    solved: boolean;
    readonly hint: string;
    readonly questionType: QuestionType;
    readonly options: Config;
    showHint: Writable<boolean>;
    visited: boolean;
    score: number;

    constructor(
        text: string,
        explanation: string,
        hint: string,
        answers: Array<Answer>,
        questionType: QuestionType,
        options: Config
    ) {
        if (answers.length === 0) {
            throw 'no answers for question provided';
        }
        this.text = text;
        this.explanation = explanation;
        this.hint = hint;
        this.solved = false;
        this.showHint = writable(false);
        this.options = options;
        this.answers = answers;
        this.questionType = questionType;
        this.visited = false;
        autoBind(this);
        this.reset();
    }

    enableHint() {
        this.showHint.update((val) => true);
    }

    reset() {
        this.selected = [];
        this.solved = false;
        this.visited = false;
        this.showHint.set(false);
        if (this.options.shuffleAnswers) {
            this.answers = shuffle(this.answers, this.answers.length);
        }
    }
    abstract isCorrect(): boolean;

    get_max_score(): number {
        return 1
    }
}

class Blanks extends BaseQuestion {
    isCorrect() {
        this.solved = false;
        return this.solved;
    }
}

class Pairs extends BaseQuestion {
    isCorrect() {
        this.solved = false;
        return this.solved;
    }
}

export class Sequence extends BaseQuestion {
    constructor(
        text: string,
        explanation: string,
        hint: string,
        answers: Array<Answer>,
        options: Config
    ) {
        // always enable shuffling for sequence questions
        options.shuffleAnswers = true;
        super(text, explanation, hint, answers, 'Sequence', options);
    }

    isCorrect() {
        // extract answer ids from answers
        let trueAnswerIds = this.answers.map((answer) => answer.id);
        this.solved = isEqual(trueAnswerIds.sort(), this.selected);
        return this.solved;
    }
}

class Choice extends BaseQuestion {
    isCorrect() {
        let trueAnswerIds = this.answers
            .filter((answer) => answer.correct)
            .map((answer) => answer.id);
        let selectedAnswerIds = this.selected.map((i) => this.answers[i].id);
        this.solved = isEqual(trueAnswerIds.sort(), selectedAnswerIds.sort());
        return this.solved;
    }
}

export class MultipleChoice extends Choice {
    constructor(
        text: string,
        explanation: string,
        hint: string,
        answers: Array<Answer>,
        options: Config
    ) {
        super(text, explanation, hint, answers, 'MultipleChoice', options);
    }
}

export class SingleChoice extends Choice {
    constructor(
        text: string,
        explanation: string,
        hint: string,
        answers: Array<Answer>,
        options: Config
    ) {
        super(text, explanation, hint, answers, 'SingleChoice', options);
        let nCorrect = this.answers.filter((answer) => answer.correct).length;
        if (nCorrect > 1) {
            throw 'Single Choice questions can not have more than one correct answer.';
        }
    }
}

export class ScoreChoice extends Choice {
    constructor(
        text: string,
        explanation: string,
        hint: string,
        answers: Array<Answer>,
        options: Config
    ) {
        super(text, explanation, hint, answers, 'ScoreChoice', options);
        let nCorrect = this.answers.filter((answer) => answer.correct).length;
        if (nCorrect > 1) {
            throw 'Single Choice questions can not have more than one correct answer.';
        }
    }
    isCorrect() {
        let selectedAnswerIds = this.selected.map((i) => this.answers[i].id);
        let selectedAnswerScore = this.selected.map((i) => this.answers[i].score);
        // console.log("selectedAnswerIds:" + selectedAnswerIds)
        
        this.score = selectedAnswerScore[0]
        // console.log( "Score:"+ this.score)
        
        const maxScore = this.get_max_score()
        const minScore = this.get_min_score()
        
        if( maxScore ==  this.score ){
            this.solved = true;
        }

        if( minScore ==  this.score ){
            this.score = 0;
            this.solved = false;
        }
        
        return this.solved;
    }

    get_min_score(): number {
        const minScore = this.answers.reduce((min, answer) => {
            return Math.min(min, answer.score);
        }, 0);
        return minScore
    }
    
    get_max_score(): number {
        const maxScore = this.answers.reduce((max, answer) => {
            return Math.max(max, answer.score);
        }, 0);
        return maxScore
    }
}

export class Answer {
    html: string;
    correct: boolean;
    id: number;
    comment: string;
    score: number;

    constructor(id: number, html: string, correct: boolean, comment: string, score: number) {
        this.html = html;
        this.correct = correct;
        this.id = id;
        this.comment = comment;
        this.score = score;
        autoBind(this);
    }
}

export class Quiz {
    questions: Array<BaseQuestion>;
    active: Writable<BaseQuestion>;
    index: Writable<number>;
    config: Config;
    onLast: Writable<boolean>;
    onResults: Writable<boolean>;
    onFirst: Writable<boolean>;
    isEvaluated: Writable<boolean>;
    allVisited: Writable<boolean>;
    max_points: number;
    user_points: number;
    user_level: number;

    constructor(questions: Array<BaseQuestion>, config: Config) {
        this.index = writable(0);
        this.questions = questions;
        this.config = config;
        if (this.config.shuffleQuestions) {
            this.questions = shuffle(this.questions, this.config.nQuestions);
        }
        if (this.questions.length == 0) {
            throw 'No questions for quiz provided';
        }
        // setup first question
        this.active = writable(this.questions[0]);
        this.questions[0].visited = true;
        this.onLast = writable(this.questions.length == 1);
        this.onResults = writable(false);
        this.onFirst = writable(true);
        this.allVisited = writable(this.questions.length == 1);
        this.isEvaluated = writable(false);
        this.max_points = this.get_max_points();
        autoBind(this);
    }

    private setActive() {
        let idx = get(this.index);
        this.active.update((act) => this.questions[idx]);
        this.questions[idx].visited = true;
    }

    private checkAllVisited(): boolean {
        for (let question of this.questions) {
            if (!question.visited) {
                return false;
            }
        }
        return true;
    }

    jump(index: number): boolean {
        if (index <= this.questions.length - 1 && index >= 0) {
            // on a question
            this.index.set(index);
            this.setActive();
            this.allVisited.set(this.checkAllVisited());
            this.onResults.set(false);
            this.onLast.set(index == this.questions.length - 1);
            this.onFirst.set(index == 0);
            return true;
        } else if (index == this.questions.length) {
            // evaluate percent level
            this.user_points = this.evaluate()
            this.user_level = Math.round((this.user_points /this.max_points)*10)
             
            // on results page
            this.onResults.set(true);
            this.onLast.set(false);
            this.index.set(index);
            return true;
        } else {
            return false;
        }
    }

    next(): boolean {
        return this.jump(get(this.index) + 1);
    }

    previous(): boolean {
        return this.jump(get(this.index) - 1);
    }

    reset(): Boolean {
        this.onLast.set(false);
        this.onResults.set(false);
        this.allVisited.set(false);
        this.isEvaluated.set(false);

        this.questions.forEach((q) => q.reset());
        return this.jump(0);
    }

    evaluate(): number {
        var points = 0;
        for (var q of this.questions) {
            if (q.isCorrect()) {
                if (this.config.scored) {
                    points += q.score;
                }else{
                    points += 1;
                }
            }
        }
        this.isEvaluated.set(true);
        // this.user_points = points;
        return points;
    }

    get_max_points(): number {
        var points = 0;
        
        if (this.config.scored) {
            for (var q of this.questions) {
                points += q.get_max_score();
            }
        }else{
            points = this.questions.length;
        }
        
        return points;
    }
}
