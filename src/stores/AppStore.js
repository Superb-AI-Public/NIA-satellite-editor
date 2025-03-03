import { types, getEnv } from "mobx-state-tree";

import CompletionStore from "./CompletionStore";
import Hotkey from "../core/Hotkey";
import InfoModal from "../components/Infomodal/Infomodal";
import Project from "./ProjectStore";
import Settings from "./SettingsStore";
import Task from "./TaskStore";
import User from "./UserStore";
import Utils from "../utils";
import { delay } from "../utils/utilities";

export default types
  .model("AppStore", {
    /**
     * XML config
     */
    config: types.string,

    /**
     * Task with data, id and project
     */
    task: types.maybeNull(Task),

    project: types.maybeNull(Project),

    /**
     * Configure the visual UI shown to the user
     */
    interfaces: types.array(types.string),

    /**
     * Flag for labeling of tasks
     */
    explore: types.optional(types.boolean, false),

    /**
     * Completions Store
     */
    completionStore: types.optional(CompletionStore, {
      completions: [],
      predictions: [],
    }),

    /**
     * User of Label Studio
     */
    user: types.maybeNull(User),

    /**
     * Debug for development environment
     */
    debug: types.optional(types.boolean, true),

    /**
     * Settings of Label Studio
     */
    settings: types.optional(Settings, {}),

    /**
     * Data of description flag
     */
    description: types.maybeNull(types.string),
    // apiCalls: types.optional(types.boolean, true),

    /**
     * Flag for settings
     */
    showingSettings: types.optional(types.boolean, false),
    /**
     * Flag
     * Description of task in Label Studio
     */
    showingDescription: types.optional(types.boolean, false),
    /**
     * Loading of Label Studio
     */
    isLoading: types.optional(types.boolean, false),
    /**
     * Submitting task; used to prevent from duplicating requests
     */
    isSubmitting: false,
    /**
     * Flag for disable task in Label Studio
     */
    noTask: types.optional(types.boolean, false),
    /**
     * Flag for no access to specific task
     */
    noAccess: types.optional(types.boolean, false),
    /**
     * Finish of labeling
     */
    labeledSuccess: types.optional(types.boolean, false),
  })
  .views(self => ({
    /**
     * Get alert
     */
    get alert() {
      return getEnv(self).alert;
    },
  }))
  .actions(self => {
    /**
     * Update settings display state
     */
    function toggleSettings() {
      self.showingSettings = !self.showingSettings;
    }

    /**
     * Update description display state
     */
    function toggleDescription() {
      self.showingDescription = !self.showingDescription;
    }

    function setFlags(flags) {
      const names = [
        "showingSettings",
        "showingDescription",
        "isLoading",
        "isSubmitting",
        "noTask",
        "noAccess",
        "labeledSuccess",
      ];

      for (let n of names) if (n in flags) self[n] = flags[n];
    }

    /**
     * Check for interfaces
     * @param {string} name
     * @returns {string | undefined}
     */
    function hasInterface(name) {
      return self.interfaces.find(i => name === i) !== undefined;
    }

    function addInterface(name) {
      return self.interfaces.push(name);
    }

    /**
     * Function
     */
    function afterCreate() {
      // important thing to detect Area atomatically: it hasn't access to store, only via global
      window.Htx = self;

      /**
       * Hotkey for submit
       */
      Hotkey.addKey("ctrl+enter", self.submitCompletion, "Submit a task");

      /**
       * Hotkey for skip task
       */
      if (self.hasInterface("skip")) Hotkey.addKey("ctrl+space", self.skipTask, "Skip a task");

      /**
       * Hotkey for update completion
       */
      if (self.hasInterface("update")) Hotkey.addKey("alt+enter", self.updateCompletion, "Update a task");

      /**
       * Hotkey for delete
       */
      Hotkey.addKey(
        "ctrl+backspace",
        function() {
          const { selected } = self.completionStore;
          selected.deleteAllRegions();
        },
        "Delete all regions",
      );

      // create relation
      Hotkey.addKey(
        "r",
        function() {
          const c = self.completionStore.selected;
          if (c && c.highlightedNode && !c.relationMode) {
            c.startRelationMode(c.highlightedNode);
          }
        },
        "Create relation when region is selected",
      );

      // unselect region
      Hotkey.addKey("u", function() {
        const c = self.completionStore.selected;
        if (c && !c.relationMode) {
          c.unselectAll();
        }
      });

      Hotkey.addKey("h", function() {
        const c = self.completionStore.selected;
        if (c && c.highlightedNode && !c.relationMode) {
          c.highlightedNode.toggleHidden();
        }
      });

      Hotkey.addKey("ctrl+z", function() {
        const { history } = self.completionStore.selected;
        history && history.canUndo && history.undo();
      });

      Hotkey.addKey("ctrl+shift+z", function() {
        const { history } = self.completionStore.selected;
        history && history.canRedo && history.redo();
      });

      Hotkey.addKey(
        "escape",
        function() {
          const c = self.completionStore.selected;
          if (c && c.relationMode) {
            c.stopRelationMode();
          } else if (c && c.highlightedNode) {
            c.regionStore.unselectAll();
          }
        },
        "Unselect region, exit relation mode",
      );

      Hotkey.addKey(
        "backspace",
        function() {
          const c = self.completionStore.selected;
          if (c && c.highlightedNode) {
            c.highlightedNode.deleteRegion();
          }
        },
        "Delete selected region",
      );

      Hotkey.addKey(
        "alt+tab",
        function() {
          const c = self.completionStore.selected;
          c && c.regionStore.selectNext();
        },
        "Circle through entities",
      );

      getEnv(self).onLabelStudioLoad(self);
    }

    /**
     *
     * @param {*} taskObject
     */
    function assignTask(taskObject) {
      if (taskObject && !Utils.Checkers.isString(taskObject.data)) {
        taskObject = {
          ...taskObject,
          data: JSON.stringify(taskObject.data),
        };
      }
      self.task = Task.create(taskObject);
    }

    function assignConfig(config) {
      const cs = self.completionStore;
      self.config = config;
      cs.initRoot(self.config);
    }

    /* eslint-disable no-unused-vars */
    function showModal(message, type = "warning") {
      InfoModal[type](message);

      // InfoModal.warning("You need to label at least something!");
    }
    /* eslint-enable no-unused-vars */

    function submitDraft(c) {
      return new Promise(resolve => {
        const fn = getEnv(self).onSubmitDraft;
        if (!fn) return resolve();
        const res = fn(self, c);
        if (res && res.then) res.then(resolve);
        else resolve(res);
      });
    }

    // Set `isSubmitting` flag to block [Submit] and related buttons during request
    // to prevent from sending duplicating requests.
    // Better to return request's Promise from SDK to make this work perfect.
    function handleSubmittingFlag(fn, defaultMessage = "Error during submit") {
      self.setFlags({ isSubmitting: true });
      const res = fn();
      // Wait for request, max 5s to not make disabled forever broken button;
      // but block for at least 0.5s to prevent from double clicking.
      Promise.race([Promise.all([res, delay(500)]), delay(5000)])
        .catch(err => showModal(err?.message || err || defaultMessage))
        .then(() => self.setFlags({ isSubmitting: false }));
    }

    function submitCompletion() {
      console.log("hello submit");
      const c = self.completionStore.selected;
      c.beforeSend();

      if (!c.validate()) return;

      c.sendUserGenerate();
      c.dropDraft();
      handleSubmittingFlag(() => getEnv(self).onSubmitCompletion(self, c));
    }

    function updateCompletion() {
      console.log("hello update");
      const c = self.completionStore.selected;
      c.beforeSend();

      if (!c.validate()) return;

      c.dropDraft();
      getEnv(self).onUpdateCompletion(self, c);
      !c.sentUserGenerate && c.sendUserGenerate();
    }

    function skipTask() {
      handleSubmittingFlag(() => getEnv(self).onSkipTask(self), "Error during skip, try again");
    }

    /**
     * Reset completion store
     */
    function resetState() {
      self.completionStore = CompletionStore.create({ completions: [] });

      // const c = self.completionStore.addInitialCompletion();

      // self.completionStore.selectCompletion(c.id);
    }

    /**
     * Function to initilaze completion store
     * Given completions and predictions
     */
    function initializeStore({ completions, predictions }) {
      const cs = self.completionStore;
      cs.initRoot(self.config);

      // eslint breaks on some optional chaining https://github.com/eslint/eslint/issues/12822
      /* eslint-disable no-unused-expressions */
      predictions?.forEach(p => {
        const obj = cs.addPrediction(p);
        cs.selectCompletion(obj.id);
        obj.deserializeCompletion(p.result);
      });
      completions?.forEach((c, i) => {
        const obj = cs.addCompletion(c);
        cs.selectCompletion(obj.id);
        obj.deserializeCompletion(c.draft || c.result);
        obj.reinitHistory();
      });
      /* eslint-enable no-unused-expressions */
    }

    return {
      setFlags,
      addInterface,
      hasInterface,

      afterCreate,
      assignTask,
      assignConfig,
      resetState,
      initializeStore,

      skipTask,
      submitDraft,
      submitCompletion,
      updateCompletion,

      showModal,
      toggleSettings,
      toggleDescription,
    };
  });
