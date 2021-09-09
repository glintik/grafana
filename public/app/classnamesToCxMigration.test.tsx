import classNames from 'classnames';
import { cx } from '@emotion/css';

const ITERATIONS_TO_RUN = 1000000;
const FUNCTIONS_TO_TEST = [
  { name: 'classnames', value: classNames },
  { name: 'cx', value: cx },
];
const TEST_CLASS_OBJ = { class1: true, class2: true, class3: false, class4: false, class5: true };
const TEST_CLASSES = [
  { name: '2 strings', value: ['class1', 'class2'] },
  { name: 'object', value: [TEST_CLASS_OBJ] },
  { name: 'string + object', value: ['class1', TEST_CLASS_OBJ] },
  { name: 'string + object + string', value: ['class1', TEST_CLASS_OBJ, 'class4'] },
  { name: '5 strings', value: ['class1', 'class2', 'class3', 'class4', 'class5'] },
];

for (let func of FUNCTIONS_TO_TEST) {
  describe(`Performance of ${func.name}`, () => {
    for (let cls of TEST_CLASSES) {
      it(cls.name, () => {
        for (let i = 0; i < ITERATIONS_TO_RUN; i++) {
          func.value.apply(this, cls.value);
        }

        expect(true).toBeTruthy();
      });
    }
  });
}
