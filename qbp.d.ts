declare namespace qdp {
    interface qdp {
        new (options: Options);
        add(item: any);
        add(arr: any[]);
        start();
        pause();
    }

    interface Options {
        threads: number;
        progress: function;
        process: function;
    }
}

declare module "qpd" {
    export = qdp;
}
